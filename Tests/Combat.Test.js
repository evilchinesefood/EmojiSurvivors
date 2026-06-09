import { describe, it, expect } from "./Runner.js";
import { createRunState } from "../Source/Engine/State.js";
import { stepWeapons } from "../Source/Systems/WeaponSystem.js";
import { stepCombat } from "../Source/Systems/CombatSystem.js";
import { CHARACTERS } from "../Source/Content/Characters.js";

function run(charId = "mage") {
  return createRunState({
    seed: 5,
    runLength: 300,
    character: CHARACTERS[charId],
    powerGrid: {},
  });
}
function rebuild(s) {
  s.hash.clear();
  for (const e of s.enemies) s.hash.insert(e);
}
let _uid = 0;
function makeEnemy(over = {}) {
  return {
    uid: ++_uid,
    kind: "wisp",
    emoji: "👻",
    size: 24,
    hp: 8,
    maxHp: 8,
    speed: 0,
    dmg: 6,
    xp: 1,
    coinChance: 0,
    elite: false,
    x: 40,
    y: 0,
    vx: 0,
    vy: 0,
    flash: 0,
    knockX: 0,
    knockY: 0,
    dead: false,
    hitTimers: {},
    ...over,
  };
}

describe("Combat", () => {
  it("an aimed bolt kills a weak enemy and drops a gem", () => {
    const s = run("mage");
    s.enemies.push(makeEnemy());
    s.player.weapons[0] = { id: "bolt", level: 1, cd: 0, alt: 0 };
    let killed = false;
    for (let i = 0; i < 40 && !killed; i++) {
      rebuild(s);
      stepWeapons(s, 1 / 60);
      stepCombat(s, 1 / 60);
      if (s.enemies.length === 0) killed = true;
    }
    expect(killed).toBeTruthy();
    expect(s.player.kills).toBe(1);
    expect(s.gems.length).toBe(1);
  });

  it("a hit >=18% of max HP emits a crit (not a plain damage) event", () => {
    const s = run("mage");
    s.enemies.push(makeEnemy({ hp: 50, maxHp: 50 })); // bolt ~14 dmg >= 50*0.18=9
    s.player.weapons[0] = { id: "bolt", level: 1, cd: 0, alt: 0 };
    let sawCrit = false;
    for (let i = 0; i < 20 && !sawCrit; i++) {
      rebuild(s);
      stepWeapons(s, 1 / 60);
      stepCombat(s, 1 / 60);
      if (s.events.some((e) => e.type === "crit")) sawCrit = true;
      s.events.length = 0;
    }
    expect(sawCrit).toBeTruthy();
  });

  it("enemy contact damages the player, then i-frames block a second hit", () => {
    const s = run("mage");
    s.enemies.push(makeEnemy({ x: 0, y: 0, hp: 9999, maxHp: 9999, dmg: 10 }));
    const before = s.player.hp;
    rebuild(s);
    stepCombat(s, 1 / 60);
    expect(s.player.hp < before).toBeTruthy();
    const after = s.player.hp;
    rebuild(s);
    stepCombat(s, 1 / 60);
    expect(s.player.hp).toBe(after); // i-frames
  });

  it("armor never reduces a hit below 1", () => {
    const s = run("knight"); // +1 armor
    s.stats.armor = 50;
    s.enemies.push(makeEnemy({ x: 0, y: 0, hp: 9999, maxHp: 9999, dmg: 3 }));
    const before = s.player.hp;
    rebuild(s);
    stepCombat(s, 1 / 60);
    expect(s.player.hp).toBe(before - 1);
  });

  it("revive consumes a life before game over", () => {
    const s = run("mage");
    s.stats.revives = 1;
    s.player.hp = 2;
    s.enemies.push(makeEnemy({ x: 0, y: 0, hp: 9999, maxHp: 9999, dmg: 999 }));
    rebuild(s);
    stepCombat(s, 1 / 60);
    expect(s.player.revivesUsed).toBe(1);
    expect(s.player.hp).toBe(s.player.maxHp);
    expect(s.outcome).toBe(null);
    // next lethal hit (clear i-frames) → game over
    s.player.invuln = 0;
    s.player.hp = 1;
    rebuild(s);
    stepCombat(s, 1 / 60);
    expect(s.outcome).toBe("gameover");
  });
});
