// Shared 2D/3D save: both versions read/write emojisurvivors-save, and the
// short-lived separate 3D save (emojisurvivors3d-*) folds in exactly once.
import { describe, it, expect } from "./Runner.js";
import {
  loadFrom,
  saveTo,
  signature,
  mergeSaves,
  migrate,
  SAVE_KEY,
  SIG_KEY,
} from "../Source/Meta/Save.js";

function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    has: (k) => m.has(k),
  };
}

function put(storage, key, sigKey, save) {
  const body = JSON.stringify(save);
  storage.setItem(key, body);
  storage.setItem(sigKey, signature(body));
}

describe("Shared 2D/3D save", () => {
  it("mergeSaves: additive counters, best-of grids/times, union unlocks, sticky taint", () => {
    const a = migrate({
      version: 3,
      coins: 100,
      powerGrid: { might: 3 },
      bestTimes: { 300: 200 },
      plays: 5,
      wins: 1,
      bestScore: 400,
      unlockedChars: ["witch"],
      playerName: "Dave",
      settings: { sfx: 0.3, manualAim: true },
    });
    const b = migrate({
      version: 3,
      coins: 50,
      powerGrid: { might: 5, luck: 2 },
      bestTimes: { 300: 150, 600: 90 },
      plays: 2,
      wins: 2,
      bestScore: 250,
      unlockedChars: ["witch", "ninja"],
      tainted: true,
      settings: { sfx: 0.9, sensitivity: 1.8, autoFire: true },
    });
    const m = mergeSaves(a, b);
    expect(m.coins).toBe(150);
    expect(m.powerGrid.might).toBe(5);
    expect(m.powerGrid.luck).toBe(2);
    expect(m.bestTimes[300]).toBe(200);
    expect(m.bestTimes[600]).toBe(90);
    expect(m.plays).toBe(7);
    expect(m.wins).toBe(3);
    expect(m.bestScore).toBe(400);
    expect([...m.unlockedChars].sort().join(",")).toBe("ninja,witch");
    expect(m.playerName).toBe("Dave");
    expect(m.tainted).toBe(true);
    expect(m.settings.sfx).toBeCloseTo(0.3, 1e-9); // shared key: primary wins
    expect(m.settings.sensitivity).toBeCloseTo(1.8, 1e-9); // 3D-only key survives
    expect(m.settings.autoFire).toBe(true);
    expect(m.settings.manualAim).toBe(true);
  });

  it("loadFrom folds a legacy 3D save into the shared one exactly once", () => {
    const st = memStorage();
    put(st, SAVE_KEY, SIG_KEY, { ...migrate({}), coins: 80, plays: 3 });
    put(st, "emojisurvivors3d-save", "emojisurvivors3d-save-sig", {
      ...migrate({}),
      coins: 20,
      plays: 1,
      bestScore: 99,
    });
    const out = loadFrom(st);
    expect(out.coins).toBe(100);
    expect(out.plays).toBe(4);
    expect(out.bestScore).toBe(99);
    expect(out.tainted).toBe(false); // both signed → merge stays clean
    expect(st.has("emojisurvivors3d-save")).toBe(false); // legacy gone
    // merged result was persisted + signed
    const again = loadFrom(st);
    expect(again.coins).toBe(100);
    expect(again.tainted).toBe(false);
  });

  it("legacy save with a bad signature taints the merged result", () => {
    const st = memStorage();
    put(st, SAVE_KEY, SIG_KEY, { ...migrate({}), coins: 10 });
    st.setItem(
      "emojisurvivors3d-save",
      JSON.stringify({ ...migrate({}), coins: 9999 }),
    ); // no sig
    const out = loadFrom(st);
    expect(out.coins).toBe(10009);
    expect(out.tainted).toBe(true);
  });

  it("legacy-only (no shared save yet) adopts the legacy save wholesale", () => {
    const st = memStorage();
    put(st, "emojisurvivors3d-save", "emojisurvivors3d-save-sig", {
      ...migrate({}),
      coins: 77,
      unlockedChars: ["reaper"],
    });
    const out = loadFrom(st);
    expect(out.coins).toBe(77);
    expect(out.unlockedChars).toEqual(["reaper"]);
    expect(out.tainted).toBe(false);
    expect(st.has(SAVE_KEY)).toBe(true); // persisted under the shared key
  });

  it("corrupt legacy blob never damages the shared save", () => {
    const st = memStorage();
    put(st, SAVE_KEY, SIG_KEY, { ...migrate({}), coins: 42 });
    st.setItem("emojisurvivors3d-save", "{not json");
    const out = loadFrom(st);
    expect(out.coins).toBe(42);
    expect(out.tainted).toBe(false);
  });

  it("round-trip through saveTo keeps a clean signature", () => {
    const st = memStorage();
    const s = migrate({});
    s.coins = 5;
    saveTo(st, s);
    expect(loadFrom(st).tainted).toBe(false);
  });
});
