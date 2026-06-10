import { describe, it, expect } from "./Runner.js";
import { createRunState } from "../Shared/Engine/State.js";
import { stepSpawner } from "../Shared/Systems/Spawner.js";
import { difficulty } from "../Shared/Content/Curve.js";
import { CHARACTERS } from "../Shared/Content/Characters.js";

function run() {
  return createRunState({
    seed: 9,
    runLength: 300,
    character: CHARACTERS.knight,
    powerGrid: {},
  });
}

describe("Spawner", () => {
  it("spawns enemies over time", () => {
    const s = run();
    for (let i = 0; i < 600; i++) {
      s.time = i / 60;
      stepSpawner(s, 1 / 60);
    }
    expect(s.enemies.length > 0).toBeTruthy();
  });

  it("does not blow past the difficulty cap by much", () => {
    const s = run();
    let max = 0;
    for (let i = 0; i < 60 * 120; i++) {
      s.time = i / 60;
      stepSpawner(s, 1 / 60);
      // simulate kills so the pool drains (otherwise nothing despawns here)
      if (s.enemies.length > 0 && i % 3 === 0) s.enemies.pop();
      max = Math.max(max, s.enemies.length);
    }
    const cap = difficulty(120).cap;
    expect(max <= cap + 60).toBeTruthy(); // cap + a wave's worth of slack
  });

  it("gates tiers behind unlockAt (no zombies before 60s)", () => {
    const s = run();
    for (let i = 0; i < 60 * 50; i++) {
      s.time = i / 60;
      stepSpawner(s, 1 / 60);
    }
    expect(s.enemies.every((e) => e.kind !== "zombie")).toBeTruthy();
  });
});
