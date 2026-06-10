import { describe, it, expect } from "./Runner.js";
import { createRunState } from "../Shared/Engine/State.js";
import { stepSim } from "../Shared/Engine/GameLoop.js";
import { CHARACTERS } from "../Shared/Content/Characters.js";

function run() {
  return createRunState({
    seed: 1,
    runLength: 300,
    character: CHARACTERS.knight,
    powerGrid: {},
  });
}

describe("Movement", () => {
  it("moves the player toward the intent at speed", () => {
    const s = run();
    s.input.move = { x: 1, y: 0 };
    stepSim(s, 1 / 60);
    expect(s.player.x).toBeCloseTo(s.stats.speed / 60, 1e-6);
    expect(s.player.y).toBe(0);
  });

  it("normalizes diagonal intent (no speed boost)", () => {
    const s = run();
    s.input.move = { x: 1, y: 1 };
    stepSim(s, 1 / 60);
    const dist = Math.hypot(s.player.x, s.player.y);
    expect(dist).toBeCloseTo(s.stats.speed / 60, 1e-4);
  });

  it("zero intent leaves the player put", () => {
    const s = run();
    s.input.move = { x: 0, y: 0 };
    stepSim(s, 1 / 60);
    expect(s.player.x).toBe(0);
    expect(s.player.y).toBe(0);
  });

  it("never produces NaN positions and advances the clock", () => {
    const s = run();
    for (let i = 0; i < 600; i++) {
      s.input.move = { x: Math.sin(i), y: Math.cos(i) };
      stepSim(s, 1 / 60);
    }
    expect(Number.isFinite(s.player.x)).toBeTruthy();
    expect(Number.isFinite(s.player.y)).toBeTruthy();
    expect(s.time).toBeCloseTo(10, 1e-6);
  });
});
