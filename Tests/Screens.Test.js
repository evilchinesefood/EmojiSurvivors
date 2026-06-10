// UI screens must render without throwing — a screen factory that crashes kills
// the shell render and the whole flow looks "dead" (this bit the co-op lobby:
// meta.unlockedChars doesn't exist; the facade is meta.isCharUnlocked). A tiny
// DOM stub is enough: screens only create elements, set attrs, and append.
import { describe, it, expect } from "./Runner.js";

function stubEl(tag) {
  return {
    tagName: tag.toUpperCase(),
    children: [],
    style: {},
    className: "",
    textContent: "",
    disabled: false,
    setAttribute() {},
    appendChild(c) {
      this.children.push(c);
      return c;
    },
    addEventListener() {},
    querySelector() {
      return null;
    },
  };
}
globalThis.document = globalThis.document || {
  createElement: (t) => stubEl(t),
  createTextNode: (s) => ({ nodeType: 3, textContent: String(s) }),
};
// h() appends `c instanceof Node ? c : createTextNode(c)` — give it a Node class
// whose instanceof matches our stubs.
globalThis.Node =
  globalThis.Node ||
  class Node {
    static [Symbol.hasInstance](o) {
      return !!o && (o.nodeType === 3 || Array.isArray(o.children));
    }
  };

const { MenuScreen } = await import("../Source/UI/MenuScreen.js");
const { CoopScreen, GuestPauseScreen } =
  await import("../Source/UI/CoopScreen.js");
const { makeMeta } = await import("../Source/Meta/Meta.js");

const storage = (() => {
  const m = new Map();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => m.set(k, v),
  };
})();
const meta = makeMeta(storage);

function coopStub(mode) {
  return {
    mode,
    room: mode === "off" ? "" : "ABCD",
    myChar: "knight",
    error: "",
    players: () => [
      { slot: 0, name: "Host", char: "knight", host: true, connected: true },
      { slot: 1, name: "Guest", char: "mage", host: false, connected: false },
    ],
    isHost: () => mode === "host",
    isGuest: () => mode === "guest",
    isConnected: () => mode === "host",
    connectedGuests: () => 1,
    setChar() {},
    guestLeave() {},
    shutdown() {},
    hostOpen: async () => {},
    guestJoin: async () => {},
  };
}

const noop = () => {};
const ctx = (mode) => ({
  coop: coopStub(mode),
  meta,
  runLength: { value: 600 },
  refresh: noop,
  onBack: noop,
  onStart: noop,
});

describe("Screens render headlessly", () => {
  it("MenuScreen", () => {
    const el = MenuScreen({
      meta,
      seasonal: {},
      quack: false,
      onPlay: noop,
      onCoop: noop,
      onShop: noop,
      onRecords: noop,
      onSettings: noop,
    });
    expect(el.children.length > 0).toBeTruthy();
  });
  it("CoopScreen pre-lobby", () => {
    expect(CoopScreen(ctx("off")).children.length > 0).toBeTruthy();
  });
  it("CoopScreen host lobby (code, players, picker, start)", () => {
    expect(CoopScreen(ctx("host")).children.length > 0).toBeTruthy();
  });
  it("CoopScreen guest lobby", () => {
    expect(CoopScreen(ctx("guest")).children.length > 0).toBeTruthy();
  });
  it("GuestPauseScreen", () => {
    const el = GuestPauseScreen({ onResume: noop, onLeave: noop });
    expect(el.children.length > 0).toBeTruthy();
  });
});
