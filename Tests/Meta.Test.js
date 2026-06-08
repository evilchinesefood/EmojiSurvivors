import { describe, it, expect } from "./Runner.js";
import { makeMeta } from "../Source/Meta/Meta.js";
import { CHARACTERS } from "../Source/Content/Characters.js";
import { POWER_GRID } from "../Source/Content/PowerGrid.js";

function mem() {
  const store = {};
  return {
    store,
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      store[k] = String(v);
    },
  };
}

describe("Meta", () => {
  it("starts with only Knight unlocked", () => {
    const m = makeMeta(mem());
    expect(m.isUnlocked("knight")).toBe(true);
    expect(m.isUnlocked("mage")).toBe(false);
  });

  it("cannot unlock a character without coins", () => {
    const m = makeMeta(mem());
    expect(m.unlockCharacter("mage")).toBe(false);
    expect(m.isUnlocked("mage")).toBe(false);
  });

  it("unlocks a character and deducts its price, persisting to storage", () => {
    const s = mem();
    const m = makeMeta(s);
    m.bankRun(300, 1000, 300);
    expect(m.unlockCharacter("mage")).toBe(true);
    expect(m.coins).toBe(1000 - CHARACTERS.mage.price);
    // a fresh wrapper over the same storage sees the unlock
    const m2 = makeMeta(s);
    expect(m2.isUnlocked("mage")).toBe(true);
  });

  it("buys power-grid levels with rising cost, capped at max", () => {
    const m = makeMeta(mem());
    m.bankRun(300, 100000, 0);
    const c0 = m.gridCost("might");
    expect(m.buyGrid("might")).toBe(true);
    expect(m.gridLevel("might")).toBe(1);
    expect(m.gridCost("might") > c0).toBeTruthy();
    for (let i = 0; i < 20; i++) m.buyGrid("might");
    expect(m.gridLevel("might")).toBe(POWER_GRID.might.max);
    expect(m.gridCost("might")).toBe(null);
    expect(m.buyGrid("might")).toBe(false);
  });

  it("banks coins and records the best (longest) time per length", () => {
    const m = makeMeta(mem());
    m.bankRun(600, 50, 240);
    expect(m.coins).toBe(50);
    expect(m.bestTimes[600]).toBe(240);
    m.bankRun(600, 10, 120); // shorter — does not replace
    expect(m.bestTimes[600]).toBe(240);
    expect(m.coins).toBe(60);
  });
});
