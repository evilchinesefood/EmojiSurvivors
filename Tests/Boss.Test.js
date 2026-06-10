import { describe, it, expect } from "./Runner.js";
import { createRunState } from "../Shared/Engine/State.js";
import { stepSpawner, spawnBoss } from "../Shared/Systems/Spawner.js";
import { stepCombat } from "../Shared/Systems/CombatSystem.js";
import { CHARACTERS } from "../Shared/Content/Characters.js";
import { bossFor } from "../Shared/Content/Bosses.js";

function run(runLength = 300) {
  return createRunState({
    seed: 6,
    runLength,
    character: CHARACTERS.knight,
    powerGrid: {},
  });
}
function rebuild(s) {
  s.hash.clear();
  for (const e of s.enemies) s.hash.insert(e);
}

describe("Boss", () => {
  it("spawns at the deadline and clears the normal field", () => {
    const s = run(300);
    for (let i = 0; i < 1200; i++) {
      s.time = 20;
      stepSpawner(s, 1 / 60);
    }
    expect(s.enemies.length > 1).toBeTruthy();
    s.time = 300;
    stepSpawner(s, 1 / 60);
    expect(s.spawn.bossSpawned).toBe(true);
    expect(s.enemies.length).toBe(1);
    expect(s.enemies[0].boss).toBe(true);
  });

  it("uses the right boss per run length", () => {
    expect(bossFor(300).id).toBe("wraith");
    expect(bossFor(600).id).toBe("dragon");
    expect(bossFor(900).id).toBe("sovereign");
  });

  it("killing the boss banks coins and sets VICTORY", () => {
    const s = run(300);
    spawnBoss(s);
    const boss = s.enemies[0];
    const reward = boss.coinReward;
    boss.hp = 0;
    boss.dead = true;
    rebuild(s);
    stepCombat(s, 1 / 60);
    expect(s.outcome).toBe("victory");
    expect(s.player.coins).toBe(reward);
    expect(s.spawn.bossAlive).toBe(false);
    expect(s.enemies.length).toBe(0);
  });

  it("the boss ignores knockback", () => {
    const s = run(300);
    spawnBoss(s);
    const boss = s.enemies[0];
    boss.knockX = 0;
    // a projectile hit would normally knock; boss must stay put
    s.projectiles.push({
      kind: "proj",
      x: boss.x - 10,
      y: boss.y,
      vx: 400,
      vy: 0,
      damage: 5,
      pierce: 1,
      emoji: "🔵",
      size: 18,
      r: 15,
      ttl: 1,
      weaponId: "bolt",
      lifesteal: 0,
      hitIds: new Set(),
    });
    rebuild(s);
    stepCombat(s, 1 / 60);
    expect(boss.knockX).toBe(0);
  });
});
