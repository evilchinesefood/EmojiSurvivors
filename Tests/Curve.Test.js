import { describe, it, expect } from "./Runner.js";
import { difficulty, xpForLevel } from "../Shared/Content/Curve.js";

describe("Curve", () => {
  it("xpForLevel is strictly increasing", () => {
    let prev = 0;
    for (let l = 1; l <= 60; l++) {
      const x = xpForLevel(l);
      expect(x > prev).toBeTruthy();
      prev = x;
    }
  });

  it("difficulty knobs are monotonic in time", () => {
    let pInt = Infinity;
    let pCap = -1;
    let pHp = 0;
    for (let t = 0; t <= 900; t += 30) {
      const d = difficulty(t);
      expect(d.spawnInterval <= pInt + 1e-9).toBeTruthy();
      expect(d.cap >= pCap - 1e-9).toBeTruthy();
      expect(d.hpScale >= pHp - 1e-9).toBeTruthy();
      pInt = d.spawnInterval;
      pCap = d.cap;
      pHp = d.hpScale;
    }
  });

  it("spawn interval + cap respect their clamps", () => {
    const late = difficulty(100000);
    expect(late.spawnInterval).toBeCloseTo(0.15, 1e-6);
    expect(late.cap).toBe(280);
    expect(late.waveInterval >= 13 - 1e-9).toBeTruthy();
  });
});
