import { describe, it, expect } from "./Runner.js";
import { makeSpatialHash } from "../Shared/World/SpatialHash.js";

describe("SpatialHash", () => {
  it("returns items inside the query circle bbox", () => {
    const h = makeSpatialHash(50);
    const a = { x: 10, y: 10 };
    const b = { x: 400, y: 400 };
    h.insert(a);
    h.insert(b);
    const out = [];
    h.queryCircle(0, 0, 40, out);
    expect(out.includes(a)).toBeTruthy();
    expect(out.includes(b)).toBe(false);
  });

  it("clear() empties the grid", () => {
    const h = makeSpatialHash(50);
    h.insert({ x: 1, y: 1 });
    h.clear();
    const out = [];
    h.queryCircle(0, 0, 100, out);
    expect(out.length).toBe(0);
  });

  it("finds a dense neighborhood", () => {
    const h = makeSpatialHash(40);
    const pts = [];
    for (let i = 0; i < 50; i++) {
      const p = { x: (i % 10) * 8, y: Math.floor(i / 10) * 8 };
      pts.push(p);
      h.insert(p);
    }
    const out = [];
    h.queryCircle(20, 20, 30, out);
    expect(out.length > 10).toBeTruthy();
  });
});
