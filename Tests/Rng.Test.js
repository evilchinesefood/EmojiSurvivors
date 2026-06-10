import { describe, it, expect } from "./Runner.js";
import { makeRng, mixSeed } from "../Shared/Engine/Rng.js";

describe("Rng", () => {
  it("is deterministic for a seed", () => {
    const a = makeRng(12345);
    const b = makeRng(12345);
    for (let i = 0; i < 20; i++) expect(a.next()).toBe(b.next());
  });

  it("differs across seeds", () => {
    const a = makeRng(1);
    const b = makeRng(2);
    let same = 0;
    for (let i = 0; i < 20; i++) if (a.next() === b.next()) same++;
    expect(same < 5).toBeTruthy();
  });

  it("int() stays in [0,n) and range() is inclusive", () => {
    const r = makeRng(7);
    for (let i = 0; i < 500; i++) {
      const k = r.int(5);
      expect(k >= 0 && k < 5).toBeTruthy();
      const j = r.range(3, 6);
      expect(j >= 3 && j <= 6).toBeTruthy();
    }
  });

  it("next() is always in [0,1)", () => {
    const r = makeRng(99);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v >= 0 && v < 1).toBeTruthy();
    }
  });

  it("mixSeed decorrelates derived streams", () => {
    expect(mixSeed(1, 0x9e3779b9) !== 1).toBeTruthy();
    expect(mixSeed(1, 0x9e3779b9) !== mixSeed(1, 0x85ebca6b)).toBeTruthy();
  });
});
