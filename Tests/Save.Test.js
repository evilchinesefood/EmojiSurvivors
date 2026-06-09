import { describe, it, expect } from "./Runner.js";
import {
  defaultSave,
  migrate,
  loadFrom,
  saveTo,
  SAVE_KEY,
  SAVE_VERSION,
} from "../Source/Meta/Save.js";

function mem(seed) {
  const store = seed ? { ...seed } : {};
  return {
    store,
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      store[k] = String(v);
    },
  };
}

describe("Save", () => {
  it("default save has the expected shape", () => {
    const d = defaultSave();
    expect(d.version).toBe(SAVE_VERSION);
    expect(d.coins).toBe(0);
    expect(d.bestTimes[300]).toBe(0);
  });

  it("migrate(null/garbage) returns a clean default", () => {
    expect(migrate(null).coins).toBe(0);
    expect(migrate("nope").version).toBe(SAVE_VERSION);
    expect(migrate(42).version).toBe(SAVE_VERSION);
  });

  it("migrate fills gaps and keeps known fields", () => {
    const m = migrate({ coins: 250, powerGrid: { might: 2 } });
    expect(m.coins).toBe(250);
    expect(m.powerGrid.might).toBe(2);
    expect(m.bestTimes[300]).toBe(0); // gap filled
  });

  it("sanitizes a bad coins value", () => {
    expect(migrate({ coins: "lots" }).coins).toBe(0);
    expect(migrate({ coins: -5 }).coins).toBe(0);
  });

  it("loadFrom empty storage returns default; roundtrips through saveTo", () => {
    const s = mem();
    expect(loadFrom(s).coins).toBe(0);
    const d = defaultSave();
    d.coins = 999;
    saveTo(s, d);
    expect(loadFrom(s).coins).toBe(999);
  });

  it("loadFrom corrupt JSON returns default (never crashes)", () => {
    const s = mem({ [SAVE_KEY]: "{not json" });
    expect(loadFrom(s).coins).toBe(0);
  });
});
