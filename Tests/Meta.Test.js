import { describe, it, expect } from "./Runner.js";
import { makeMeta } from "../Shared/Meta/Meta.js";
import { POWER_GRID } from "../Shared/Content/PowerGrid.js";

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
  it("starts with no coins and an empty power grid", () => {
    const m = makeMeta(mem());
    expect(m.coins).toBe(0);
    expect(m.gridLevel("might")).toBe(0);
  });

  it("cannot buy a power-grid level without coins", () => {
    const m = makeMeta(mem());
    expect(m.buyGrid("might")).toBe(false);
    expect(m.gridLevel("might")).toBe(0);
  });

  it("buys power-grid levels with rising cost, capped at max, persisting", () => {
    const s = mem();
    const m = makeMeta(s);
    m.bankRun(300, 100000, 0);
    const c0 = m.gridCost("might");
    expect(m.buyGrid("might")).toBe(true);
    expect(m.gridLevel("might")).toBe(1);
    expect(m.gridCost("might") > c0).toBeTruthy();
    // a fresh wrapper over the same storage sees the purchase
    expect(makeMeta(s).gridLevel("might")).toBe(1);
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
