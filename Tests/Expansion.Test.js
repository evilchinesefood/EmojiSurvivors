import { describe, it, expect } from "./Runner.js";
import { CHARACTERS, CHARACTER_IDS } from "../Source/Content/Characters.js";
import { WEAPONS, BASE_WEAPON_IDS } from "../Source/Content/Weapons.js";
import { PASSIVES } from "../Source/Content/Passives.js";
import { POWER_GRID } from "../Source/Content/PowerGrid.js";
import { ENEMIES, NORMAL_TIERS, ELITE_IDS } from "../Source/Content/Enemies.js";
import { resolveModifiers } from "../Source/Content/Modifiers.js";
import { resolve } from "../Source/Systems/StatsModel.js";
import { createRunState } from "../Source/Engine/State.js";
import { levelUpChoices, applyChoice } from "../Source/Systems/Leveling.js";
import { RUN_LENGTHS } from "../Source/Content/Curve.js";
import { bossFor } from "../Source/Content/Bosses.js";
import { makeMeta } from "../Source/Meta/Meta.js";

describe("Expansion — roster + weapons", () => {
  it("10 characters, each with a valid starting weapon", () => {
    expect(CHARACTER_IDS.length).toBe(10);
    for (const id of CHARACTER_IDS)
      expect(!!WEAPONS[CHARACTERS[id].weapon]).toBe(true);
  });

  it("every base weapon is some character's starter", () => {
    const starters = new Set(CHARACTER_IDS.map((id) => CHARACTERS[id].weapon));
    for (const id of BASE_WEAPON_IDS) expect(starters.has(id)).toBe(true);
  });

  it("every base weapon has a wired evolution; every partner passive exists", () => {
    for (const id of BASE_WEAPON_IDS) {
      const w = WEAPONS[id];
      expect(!!WEAPONS[w.evolvesTo]).toBe(true);
      expect(WEAPONS[w.evolvesTo].evolved).toBe(true);
      expect(!!PASSIVES[w.requiresPassive]).toBe(true);
    }
  });

  it("every passive partners exactly one base weapon", () => {
    const partners = BASE_WEAPON_IDS.map((id) => WEAPONS[id].requiresPassive);
    expect(new Set(partners).size).toBe(partners.length);
    expect(partners.length).toBe(Object.keys(PASSIVES).length);
  });

  it("exactly four characters carry an unlock cost", () => {
    const costed = CHARACTER_IDS.filter((id) => CHARACTERS[id].cost);
    expect(costed.length).toBe(4);
  });
});

describe("Expansion — power grid", () => {
  it("the four new rows resolve into their stats", () => {
    const s = resolve([], {}, { banish: 3, crit: 5, thorns: 5, armory: 2 });
    expect(s.banishes).toBe(3);
    expect(s.critChance).toBeCloseTo(0.15);
    expect(s.thorns).toBe(20);
    expect(s.weaponStartLevel).toBe(2);
  });

  it("armory seeds the starting weapon level; banish adds charges", () => {
    const s = createRunState({
      seed: 1,
      runLength: 300,
      character: CHARACTERS.knight,
      powerGrid: { armory: 2, banish: 3 },
    });
    expect(s.player.weapons[0].level).toBe(3);
    expect(s.banishesLeft).toBe(4);
  });

  it("grid has 17 rows incl. the infinite Ascension sink", () => {
    expect(Object.keys(POWER_GRID).length).toBe(17);
    expect(POWER_GRID.ascension.infinite).toBe(true);
  });
});

describe("Expansion — hard mode + gimmicks", () => {
  it("hard folds the standing-still-is-fatal retune", () => {
    const c = resolveModifiers({ hard: true });
    expect(c.enemyHpMul).toBeCloseTo(3.6);
    expect(c.enemyDmgMul).toBeCloseTo(4.8);
    expect(c.enemySpeedMul).toBeCloseTo(2.3);
    expect(c.spawnMul).toBeCloseTo(3.6);
    expect(c.bossHpMul).toBeCloseTo(3.0);
    expect(c.bossDmgMul).toBeCloseTo(2.2);
    expect(c.xpMul).toBeCloseTo(1.6);
    expect(c.coinMul).toBeCloseTo(1.75);
  });

  it("second sight deals 4-card hands", () => {
    const s = createRunState({
      seed: 9,
      runLength: 300,
      character: CHARACTERS.witch,
    });
    s.pendingLevelUps = 3;
    s.awaitingLevelUp = true;
    for (let i = 0; i < 3; i++) {
      const hand = levelUpChoices(s);
      expect(hand.length).toBe(4);
      applyChoice(s, hand[0]);
    }
  });

  it("easter-egg specials stay out of both spawn pools", () => {
    expect(NORMAL_TIERS.includes("disco")).toBe(false);
    expect(NORMAL_TIERS.includes("karen")).toBe(false);
    expect(ELITE_IDS.includes("disco")).toBe(false);
    expect(!!ENEMIES.disco && !!ENEMIES.karen).toBe(true);
  });
});

describe("Expansion — 30-min length + infinite sink", () => {
  it("1800 is a run length with its own boss", () => {
    expect(RUN_LENGTHS.includes(1800)).toBe(true);
    const b = bossFor(1800);
    expect(b.id).toBe("voidmaw");
    expect(b.hp > 12000).toBe(true);
  });

  it("Ascension never maxes, its cost compounds, and might grows then caps", () => {
    const s = makeMeta(memStore());
    s.bankRun(300, 1e9, 1); // fund it
    let last = 0;
    for (let i = 0; i < 6; i++) {
      const cost = s.gridCost("ascension");
      expect(cost > last || i === 0).toBe(true);
      last = cost;
      expect(s.buyGrid("ascension")).toBe(true); // buyable past any pip count
    }
    expect(s.gridLevel("ascension")).toBe(6);
    const base = resolve([], {}, {}).might;
    expect(resolve([], {}, { ascension: 10 }).might > base).toBe(true);
    // Tampered/huge level must stay finite (no Infinity → NaN damage).
    expect(Number.isFinite(resolve([], {}, { ascension: 9999 }).might)).toBe(
      true,
    );
  });

  it("applyChoice resolves a synthetic locked filler (heal/coins)", () => {
    const s = createRunState({
      seed: 1,
      runLength: 300,
      character: CHARACTERS.knight,
    });
    s.player.hp = 1;
    applyChoice(s, { kind: "heal" });
    expect(s.player.hp > 1).toBe(true);
    const c0 = s.player.coins;
    applyChoice(s, { kind: "coins" });
    expect(s.player.coins > c0).toBe(true);
  });
});

function memStore() {
  const m = new Map();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => m.set(k, String(v)),
  };
}
