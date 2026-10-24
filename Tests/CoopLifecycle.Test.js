import { describe, it, expect } from "./Runner.js";
import { makeCoop } from "../Shared/Net/Coop.js";
import { signal } from "../Shared/Net/Signal.js";

async function fixture(check) {
  const saved = { ...signal };
  const oldRtc = globalThis.RTCPeerConnection;
  const oldListener = globalThis.addEventListener;
  const events = new Map();
  globalThis.addEventListener = (name, fn) => events.set(name, fn);
  const oldInterval = globalThis.setInterval, oldClear = globalThis.clearInterval;
  const timers = new Map(), pcs = [], confirmed = [], released = [], left = [];
  let receive;
  globalThis.setInterval = (fn, ms) => { timers.set(fn, ms); return fn; };
  globalThis.clearInterval = (fn) => timers.delete(fn);
  globalThis.RTCPeerConnection = class {
    constructor() { this.channels = []; pcs.push(this); }
    createDataChannel(label) {
      const ch = { label, readyState: "connecting", send() {} };
      this.channels.push(ch); return ch;
    }
    async createOffer() { return { type: "offer", sdp: "dummy" }; }
    async setLocalDescription(d) { this.localDescription = d; }
    close() { this.connectionState = "closed"; this.onconnectionstatechange?.(); }
    open() { for (const ch of this.channels) ch.readyState = "open"; this.channels[0].onopen(); }
  };
  Object.assign(signal, {
    create: async () => ({ ok: true, room: "ABCDEF" }),
    send: async () => true,
    makePoller: (_room, _peer, cb) => { receive = cb; return { stop() {} }; },
    confirm: async (room, peers) => { confirmed.push({ room, peers }); return true; },
    release: async (room, peer) => { released.push({ room, peer }); return true; },
    leave: async (room, peer) => { left.push({ room, peer }); return true; },
  });
  const coop = makeCoop("test");
  try {
    await coop.hostOpen("Host", "knight");
    await check({ coop, pcs, confirmed, released, left, timers, events,
      hello: (id) => receive(id, { t: "hello", v: "test", name: id, char: "knight" }) });
  } finally {
    coop.shutdown();
    Object.assign(signal, saved);
    globalThis.RTCPeerConnection = oldRtc;
    globalThis.addEventListener = oldListener;
    globalThis.setInterval = oldInterval; globalThis.clearInterval = oldClear;
  }
}

describe("Coop signaling lifecycle", () => {
  it("only connected guests receive host admission and renewal", async () => {
    await fixture(async ({ hello, pcs, confirmed, timers }) => {
      hello("pending");
      expect(confirmed.flatMap((c) => c.peers)).toEqual([]);
      pcs[0].open();
      expect(confirmed.at(-1)?.peers).toEqual(["pending"]);
      hello("never-connected");
      const renew = [...timers].find(([, ms]) => ms === 15000)?.[0];
      expect(typeof renew).toBe("function");
      renew();
      expect(confirmed.at(-1).peers).toEqual(["pending"]);
    });
  });
  it("replaces a reconnecting peer without releasing its identity, and releases on close", async () => {
    await fixture(async ({ hello, pcs, released, coop }) => {
      hello("guest"); hello("guest");
      expect(pcs.length).toBe(2);
      expect(released.length).toBe(0);
      pcs[1].close();
      expect(released).toEqual([{ room: "ABCDEF", peer: "guest" }]);
      expect(coop.players().length).toBe(1);
    });
  });
  it("shutdown closes the room once and stops renewal", async () => {
    await fixture(async ({ hello, pcs, left, released, timers, coop }) => {
      hello("guest"); pcs[0].open();
      coop.shutdown();
      expect(left).toEqual([{ room: "ABCDEF", peer: "host" }]);
      expect(released).toEqual([]);
      expect(timers.size).toBe(0);
      expect(coop.mode).toBe("off");
    });
  });
  it("reuses player slots across repeated joins and leaves", async () => {
    await fixture(async ({ hello, pcs, coop }) => {
      for (let i = 0; i < 8; i++) {
        hello(`guest${i}`);
        expect(coop.players()[1].slot).toBe(1);
        pcs.at(-1).close();
      }
    });
  });
  it("closing the page releases its room", async () => {
    await fixture(async ({ events, left }) => {
      expect(typeof events.get("pagehide")).toBe("function");
      events.get("pagehide")();
      expect(left).toEqual([{ room: "ABCDEF", peer: "host" }]);
    });
  });
  it("leaving during room creation releases the late result without reopening a lobby", async () => {
    await fixture(async ({ coop, left }) => {
      let finish;
      signal.create = () => new Promise((resolve) => { finish = resolve; });
      const pending = coop.hostOpen("Host", "knight");
      left.length = 0;
      coop.shutdown();
      finish({ ok: true, room: "GHJKLM" });
      await pending;
      expect(coop.room).toBe("");
      expect(left).toEqual([{ room: "GHJKLM", peer: "host" }]);
    });
  });
  it("leaving during admission releases the late guest without starting RTC", async () => {
    await fixture(async ({ coop, left, pcs }) => {
      let finish;
      signal.join = () => new Promise((resolve) => { finish = resolve; });
      const pending = coop.guestJoin("GHJKLM", "Guest", "knight");
      left.length = 0;
      coop.shutdown();
      finish({ ok: true, peer: "late-guest" });
      await pending;
      expect(coop.room).toBe("");
      expect(pcs.length).toBe(0);
      expect(left).toEqual([{ room: "GHJKLM", peer: "late-guest" }]);
    });
  });
});
