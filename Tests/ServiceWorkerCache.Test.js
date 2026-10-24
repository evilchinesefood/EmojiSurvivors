import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, it, expect } from "./Runner.js";

function response(body, ok = true) {
  return { body, ok, type: "basic", clone() { return response(body, ok); } };
}

function worker(version, network = async () => response("network")) {
  const href = `https://game.test/survivors/${version}/ServiceWorker.js`;
  const normalize = (request) => new URL(request.url || request, href).href;
  const stores = new Map(), listeners = new Map();
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const data = stores.get(name);
      return {
        match: async (request) => data.get(normalize(request)),
        put: async (request, value) => data.set(normalize(request), value),
      };
    },
    async match(request, options = {}) {
      for (const [name, data] of stores) {
        if (options.cacheName && name !== options.cacheName) continue;
        if (data.has(normalize(request))) return data.get(normalize(request));
      }
    },
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
  };
  const context = vm.createContext({
    URL, caches, fetch: network, location: new URL(href),
    Response: { error: () => response("network-error", false) },
    self: {
      location: new URL(href),
      addEventListener: (name, fn) => listeners.set(name, fn),
      clients: { claim: async () => {} },
    },
  });
  vm.runInContext(readFileSync(new URL(`../${version}/ServiceWorker.js`, import.meta.url), "utf8"), context);
  const current = vm.runInContext("CACHE", context);
  const opposite = version === "2d" ? "emojisurvivors3d-old" : "emojisurvivors-old";
  const oldOwn = version === "2d" ? "emojisurvivors-old" : "emojisurvivors3d-old";
  return {
    current, opposite, oldOwn, caches,
    async seed(name, path, value) { await (await caches.open(name)).put(path, response(value)); },
    fetch(path, mode = "cors") {
      let result;
      listeners.get("fetch")({
        request: { method: "GET", url: normalize(path), mode },
        respondWith: (promise) => { result = promise; },
      });
      return result;
    },
    activate() {
      let result;
      listeners.get("activate")({ waitUntil: (promise) => { result = promise; } });
      return result;
    },
  };
}

for (const version of ["2d", "3d"]) describe(`${version} service worker cache isolation`, () => {
  it("serves current shared scripts when the opposite and previous caches contain stale copies", async () => {
    const w = worker(version);
    for (const path of ["../Shared/Net/Signal.js", "../Shared/Net/Coop.js"]) {
      await w.seed(w.opposite, path, "stale opposite");
      await w.seed(w.oldOwn, path, "stale own");
      await w.seed(w.current, path, "current");
      expect((await w.fetch(path)).body).toBe("current");
    }
  });
  it("fetches missing current assets instead of borrowing another cache", async () => {
    const w = worker(version);
    await w.seed(w.opposite, "../Shared/Net/Signal.js", "stale opposite");
    expect((await w.fetch("../Shared/Net/Signal.js")).body).toBe("network");
  });
  for (const failure of ["offline", "503"]) {
    const network = async () => {
      if (failure === "offline") throw new Error("offline");
      return response("unavailable", false);
    };
    it(`uses its current navigation response on ${failure}`, async () => {
      const w = worker(version, network);
      await w.seed(w.opposite, "./", "stale opposite");
      await w.seed(w.oldOwn, "./", "stale own");
      await w.seed(w.current, "./", "current navigation");
      expect((await w.fetch("./", "navigate")).body).toBe("current navigation");
    });
    it(`falls back to its current index on ${failure} even if another cache has the requested navigation`, async () => {
      const w = worker(version, network);
      await w.seed(w.opposite, "./", "stale requested navigation");
      await w.seed(w.opposite, "./Index.html", "stale index");
      await w.seed(w.oldOwn, "./Index.html", "old own index");
      await w.seed(w.current, "./Index.html", "current index");
      expect((await w.fetch("./", "navigate")).body).toBe("current index");
    });
  }
  it("activation removes only previous caches belonging to its own version", async () => {
    const w = worker(version);
    await w.seed(w.opposite, "./", "opposite");
    await w.seed(w.oldOwn, "./", "old own");
    await w.seed(w.current, "./", "current");
    await w.activate();
    expect(await w.caches.keys()).toEqual([w.opposite, w.current]);
  });
});
