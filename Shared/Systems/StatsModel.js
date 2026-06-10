// Pure balance core. Folds three layers — character tilt, owned passives, and the
// account power grid — into one resolved stat object every system reads. Nothing
// else hard-codes a stat.
//
// Convention: multiplier stats default 1 (compound via op:"mul"); additive stats
// default 0 (op:"add"). `cooldown` is an attack-SPEED/haste multiplier — effective
// weapon interval = baseCooldown / cooldown, so higher = faster.
import { PASSIVES } from "../Content/Passives.js";
import { POWER_GRID } from "../Content/PowerGrid.js";

export const BASE_SPEED = 160; // px/s at speedMul 1
export const BASE_MAXHP = 110;
export const BASE_MAGNET = 120; // px vacuum radius at magnet 1
export const BASE_PICKUP = 30; // px direct-collect radius

function base() {
  return {
    might: 1,
    area: 1,
    cooldown: 1,
    projSpeed: 1,
    duration: 1,
    luck: 1,
    greed: 1,
    growth: 1,
    magnet: 1,
    speedMul: 1,
    hpMul: 1,
    recovery: 0,
    projCount: 0,
    armor: 0,
    revives: 0,
    rerolls: 0,
    banishes: 0,
    critChance: 0,
    thorns: 0,
    weaponStartLevel: 0,
  };
}

function apply(acc, mods) {
  if (!mods) return;
  for (const m of mods) {
    if (m.op === "mul") acc[m.stat] = (acc[m.stat] ?? 1) * m.value;
    else acc[m.stat] = (acc[m.stat] ?? 0) + m.value;
  }
}

export function resolve(tilt = [], ownedPassives = {}, powerGrid = {}) {
  const acc = base();
  apply(acc, tilt);
  for (const id in ownedPassives) {
    const p = PASSIVES[id];
    const lvl = ownedPassives[id] | 0;
    if (p) for (let i = 0; i < lvl; i++) apply(acc, p.mods);
  }
  for (const stat in powerGrid) {
    const row = POWER_GRID[stat];
    const lvl = powerGrid[stat] | 0;
    if (row) for (let i = 0; i < lvl; i++) apply(acc, row.mods);
  }
  return {
    // Ceiling guards the infinite Ascension row (and tampered saves) from overflowing
    // might to Infinity → NaN damage. No legit build approaches it.
    might: Math.max(0, Math.min(acc.might, 1e6)),
    area: acc.area,
    cooldown: Math.max(0.2, acc.cooldown),
    projSpeed: Math.max(0.2, acc.projSpeed),
    duration: Math.max(0.2, acc.duration),
    luck: Math.max(0, acc.luck),
    greed: Math.max(0, acc.greed),
    growth: Math.max(0.1, acc.growth),
    magnet: Math.max(0.2, acc.magnet),
    speed: BASE_SPEED * acc.speedMul,
    maxHp: Math.max(1, Math.round(BASE_MAXHP * acc.hpMul)),
    recovery: Math.max(0, acc.recovery),
    projCount: Math.max(0, Math.round(acc.projCount)),
    armor: Math.max(0, acc.armor),
    revives: Math.max(0, Math.round(acc.revives)),
    rerolls: Math.max(0, Math.round(acc.rerolls)),
    banishes: Math.max(0, Math.round(acc.banishes)),
    critChance: Math.min(0.6, Math.max(0, acc.critChance)),
    thorns: Math.max(0, acc.thorns),
    weaponStartLevel: Math.max(0, Math.round(acc.weaponStartLevel)),
  };
}

export function magnetRadius(stats) {
  return BASE_MAGNET * stats.magnet;
}
export function pickupRadius(stats) {
  return BASE_PICKUP + BASE_MAGNET * (stats.magnet - 1) * 0.15;
}
