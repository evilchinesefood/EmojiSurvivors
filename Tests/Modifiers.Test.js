import { describe, it, expect } from "./Runner.js";
import {
  resolveModifiers,
  modActive,
  modValueLabel,
  unlockLabel,
  MOD_DEFS,
} from "../Shared/Content/Modifiers.js";
import { createRunState } from "../Shared/Engine/State.js";
import { stepSpawner } from "../Shared/Systems/Spawner.js";
import { CHARACTERS } from "../Shared/Content/Characters.js";
import { makeMeta } from "../Shared/Meta/Meta.js";

function memStore() {
  const m = {};
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => {
      m[k] = String(v);
    },
  };
}

function run(modifiers, charId = "knight") {
  return createRunState({
    seed: 7,
    runLength: 300,
    character: CHARACTERS[charId],
    powerGrid: {},
    modifiers,
  });
}

describe("Modifiers — resolve", () => {
  it("no selection resolves to a neutral config", () => {
    const c = resolveModifiers({});
    expect(c.enemyHpMul).toBe(1);
    expect(c.spawnMul).toBe(1);
    expect(c.xpMul).toBe(1);
    expect(c.maxWeapons).toBe(6);
    expect(c.maxWeaponLevel).toBe(5);
    expect(c.startLevel).toBe(1);
    expect(c.endless).toBe(false);
    expect(c.active.length).toBe(0);
  });

  it("Hard Mode toughens enemies but boosts rewards", () => {
    const c = resolveModifiers({ hard: true });
    expect(c.enemyHpMul > 1).toBeTruthy();
    expect(c.enemyDmgMul > 1).toBeTruthy();
    expect(c.xpMul > 1).toBeTruthy();
    expect(c.coinMul > 1).toBeTruthy();
    expect(c.bossHpMul > 1).toBeTruthy();
    expect(c.active.includes("hard")).toBeTruthy();
  });

  it("Endless uncaps weapon levels and flags the run", () => {
    const c = resolveModifiers({ endless: true });
    expect(c.endless).toBe(true);
    expect(c.maxWeaponLevel).toBe(99);
  });

  it("Curse multiplies both difficulty and rewards", () => {
    const c = resolveModifiers({ curse: 2 });
    expect(c.enemyHpMul).toBe(2);
    expect(c.xpMul).toBe(2);
    expect(c.coinMul).toBe(2);
  });

  it("Hardcore wipes all revives", () => {
    const c = resolveModifiers({ hardcore: true });
    expect(c.extraRevives < 0).toBeTruthy();
  });

  it("choice values at their default do not count as active", () => {
    const c = resolveModifiers({ maxWeapons: 6, xpRate: 1 });
    expect(c.active.length).toBe(0);
  });
});

describe("Modifiers — applied to a run", () => {
  it("Glass Cannon doubles might and halves HP via stat folding", () => {
    const base = run({});
    const glass = run({ glassCannon: true });
    expect(glass.stats.might > base.stats.might).toBeTruthy();
    expect(glass.player.maxHp < base.player.maxHp).toBeTruthy();
  });

  it("Head Start begins at a higher level with picks queued", () => {
    const s = run({ startLevel: 5 });
    expect(s.player.level).toBe(5);
    expect(s.awaitingLevelUp).toBe(true);
    expect(s.pendingLevelUps).toBe(4);
  });

  it("Extra Lives raise the revive count; Hardcore zeroes it", () => {
    const lives = run({ revives: 3 });
    const hardcore = run({ hardcore: true });
    expect(lives.stats.revives >= 3).toBeTruthy();
    expect(hardcore.stats.revives).toBe(0);
  });

  it("Giant Magnet hugely extends the magnet radius", () => {
    const base = run({});
    const mag = run({ magnetMax: true });
    expect(mag.player.magnetR > base.player.magnetR * 10).toBeTruthy();
  });

  it("Hard Mode spawns tougher enemies", () => {
    const easy = run({});
    const hard = run({ hard: true });
    stepSpawner(easy, 5);
    stepSpawner(hard, 5);
    const eHp = easy.enemies[0] ? easy.enemies[0].maxHp : 0;
    const hHp = hard.enemies[0] ? hard.enemies[0].maxHp : 0;
    expect(hHp > eHp).toBeTruthy();
  });

  it("Endless never spawns the boss past the deadline", () => {
    const s = run({ endless: true });
    s.time = s.runLength + 30;
    stepSpawner(s, 0.1);
    expect(s.spawn.bossSpawned).toBe(false);
    expect(s.enemies.every((e) => !e.boss)).toBeTruthy();
  });
});

describe("Modifiers — display + unlocks", () => {
  it("formats choice values with their unit", () => {
    expect(modValueLabel(MOD_DEFS.xpRate, 2)).toBe("×2");
    expect(modValueLabel(MOD_DEFS.startLevel, 5)).toBe("Lv 5");
    expect(modValueLabel(MOD_DEFS.maxWeapons, 8)).toBe("8");
  });

  it("describes unlock requirements", () => {
    expect(unlockLabel(MOD_DEFS.hard)).toBe("");
    expect(unlockLabel(MOD_DEFS.endless)).toBe("Win 3 runs");
    expect(unlockLabel(MOD_DEFS.magnetMax)).toBe("Play 2 runs");
  });

  it("modActive reflects whether a value changes the run", () => {
    expect(modActive(MOD_DEFS.hard, true)).toBe(true);
    expect(modActive(MOD_DEFS.hard, false)).toBe(false);
    expect(modActive(MOD_DEFS.xpRate, 1)).toBe(false);
    expect(modActive(MOD_DEFS.xpRate, 3)).toBe(true);
  });

  it("Meta gates modifiers by plays and wins, and reports new unlocks", () => {
    const meta = makeMeta(memStore());
    expect(meta.isModifierUnlocked(MOD_DEFS.hard)).toBe(true);
    expect(meta.isModifierUnlocked(MOD_DEFS.endless)).toBe(false);
    const before = meta.wins;
    meta.recordWin();
    meta.recordWin();
    meta.recordWin();
    expect(meta.isModifierUnlocked(MOD_DEFS.endless)).toBe(true);
    const fresh = meta.newlyUnlocked(meta.plays, before);
    expect(fresh.some((d) => d.id === "endless")).toBeTruthy();
  });

  it("recordPlay increments plays and remembers the selection", () => {
    const meta = makeMeta(memStore());
    meta.recordPlay({ hard: true });
    expect(meta.plays).toBe(1);
    expect(meta.lastModifiers.hard).toBe(true);
  });
});
