import { describe, it, expect } from "./Runner.js";
import { createRunState } from "../Shared/Engine/State.js";
import { stepPickups } from "../Shared/Systems/PickupSystem.js";
import { CHARACTERS } from "../Shared/Content/Characters.js";

function run(charId = "knight") {
  return createRunState({
    seed: 4,
    runLength: 300,
    character: CHARACTERS[charId],
    powerGrid: {},
  });
}

describe("PickupSystem", () => {
  it("collects a gem on contact and grants XP", () => {
    const s = run();
    s.gems.push({
      x: 5,
      y: 0,
      value: 3,
      vx: 0,
      vy: 0,
      vacuum: false,
      emoji: "🔷",
      size: 15,
    });
    stepPickups(s, 1 / 60);
    expect(s.gems.length).toBe(0);
    expect(s.player.xp).toBeCloseTo(3 * s.stats.growth, 1e-6);
  });

  it("vacuums a gem inside the magnet radius toward the player", () => {
    const s = run();
    const g = {
      x: s.player.magnetR - 5,
      y: 0,
      value: 1,
      vx: 0,
      vy: 0,
      vacuum: false,
      emoji: "🔹",
      size: 13,
    };
    s.gems.push(g);
    const d0 = Math.abs(g.x);
    stepPickups(s, 1 / 60);
    if (s.gems.length) expect(Math.abs(g.x) < d0).toBeTruthy();
    expect(g.vacuum).toBe(true);
  });

  it("banks coins with greed applied", () => {
    const s = run("rogue"); // greedy: greed > 1
    s.coins.push({
      x: 0,
      y: 0,
      value: 10,
      vx: 0,
      vy: 0,
      vacuum: false,
      emoji: "🪙",
      size: 15,
    });
    stepPickups(s, 1 / 60);
    expect(s.player.coins).toBe(Math.round(10 * s.stats.greed));
  });

  it("a chest grants level-ups", () => {
    const s = run();
    s.drops.push({ x: 0, y: 0, kind: "chest", emoji: "🎁", size: 26 });
    stepPickups(s, 1 / 60);
    expect(s.pendingLevelUps >= 1).toBeTruthy();
    expect(s.awaitingLevelUp).toBe(true);
  });

  it("a magnet pickup flags every gem for vacuum", () => {
    const s = run();
    s.gems.push({
      x: 2000,
      y: 0,
      value: 1,
      vacuum: false,
      emoji: "🔹",
      size: 13,
    });
    s.drops.push({ x: 0, y: 0, kind: "magnet", emoji: "🧲", size: 22 });
    stepPickups(s, 1 / 60);
    expect(s.gems[0].vacuum).toBe(true);
  });
});
