// XP curve, level-up trigger, and 1-of-3 (Luck → maybe 4) choice generation + apply.
// Choices: new weapon / weapon level-up / new passive / passive level-up / evolution /
// stat filler. Luck biases toward new + evolution rolls and can add a 4th card.
// Applying a passive/power change re-resolves stats (and conserves the HP ratio).
import {
  WEAPONS,
  BASE_WEAPON_IDS,
  MAX_WEAPON_LEVEL,
} from "../Content/Weapons.js";
import { PASSIVES, PASSIVE_IDS } from "../Content/Passives.js";
import { xpForLevel } from "../Content/Curve.js";
import { resolve, magnetRadius, pickupRadius } from "./StatsModel.js";
import { eligibleEvolutions, applyEvolution } from "./Evolutions.js";
import { emit } from "../Engine/State.js";

export const WEAPON_SLOTS = 6;
export const PASSIVE_SLOTS = 6;

const FILLERS = [
  { kind: "heal", emoji: "🍗", label: "Feast", desc: "Restore 40% HP" },
  { kind: "coins", emoji: "💰", label: "Coin Cache", desc: "+20 coins" },
];

export function recomputeStats(state) {
  const p = state.player;
  const mods = state.modifiers;
  const stats = resolve(
    state.character.tilt.concat(mods ? mods.statMods : []),
    p.passives,
    state.powerGrid,
  );
  if (mods) stats.revives = Math.max(0, stats.revives + mods.extraRevives);
  const oldMax = p.maxHp;
  state.stats = stats;
  p.maxHp = stats.maxHp;
  // Conserve the HP ratio across a maxHp change — an HP-up pick is NOT a free heal.
  if (stats.maxHp !== oldMax) {
    const ratio = oldMax > 0 ? p.hp / oldMax : 1;
    const next = Math.min(p.maxHp, Math.round(p.maxHp * ratio));
    // HP is fractional — never round a living player down to 0 (alive-at-0 state).
    p.hp = p.hp > 0 ? Math.max(1, next) : next;
  }
  if (p.hp > p.maxHp) p.hp = p.maxHp;
  p.magnetR = magnetRadius(stats);
  p.pickupR = pickupRadius(stats);
}

// Trigger: drain XP into levels (possibly several at once), then await the picks.
export function stepLeveling(state) {
  const p = state.player;
  if (state.awaitingLevelUp || p.xp < p.xpNext) return;
  while (p.xp >= p.xpNext) {
    p.xp -= p.xpNext;
    p.level += 1;
    p.xpNext = xpForLevel(p.level);
    state.pendingLevelUps += 1;
    if (state.gimmick === "regrowth")
      p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.05);
    emit(state, "levelup", { level: p.level });
  }
  state.awaitingLevelUp = true;
}

function weightedTake(rng, pool) {
  let total = 0;
  for (const c of pool) total += c.weight;
  let r = rng.float(0, total);
  for (let i = 0; i < pool.length; i++) {
    r -= pool[i].weight;
    if (r <= 0) return pool.splice(i, 1)[0];
  }
  return pool.splice(pool.length - 1, 1)[0];
}

export function levelUpChoices(state) {
  const p = state.player;
  const luck = state.stats.luck;
  const cand = [];
  const ban = state.banishedCards; // ids removed from this run's pool
  const m = state.modifiers;
  const maxWLvl = m ? m.maxWeaponLevel : MAX_WEAPON_LEVEL;
  const maxW = m ? m.maxWeapons : WEAPON_SLOTS;
  const maxP = m ? m.maxPassives : PASSIVE_SLOTS;
  const oneWeapon = m ? m.oneWeapon : false;

  // Evolutions are forced to the front — rare and exciting, never buried.
  const forced = eligibleEvolutions(state)
    .filter((evo) => !ban.has(evo.to))
    .map((evo) => ({
      kind: "evolution",
      id: evo.to,
      evo,
      emoji: WEAPONS[evo.to].emoji,
      label: WEAPONS[evo.to].name,
      desc: "Evolve " + WEAPONS[evo.from].name,
    }));

  for (const w of p.weapons) {
    const def = WEAPONS[w.id];
    if (def && w.level < maxWLvl && !ban.has(w.id))
      cand.push({
        kind: "weapon-up",
        id: w.id,
        w,
        emoji: def.emoji,
        label: def.name + " ⮕ L" + (w.level + 1),
        desc: "Upgrade weapon",
        weight: 10 + w.level * 8,
      });
  }
  for (const id in p.passives) {
    const pd = PASSIVES[id];
    if (pd && p.passives[id] < pd.max && !ban.has(id))
      cand.push({
        kind: "passive-up",
        id,
        emoji: pd.emoji,
        label: pd.name + " ⮕ L" + (p.passives[id] + 1),
        desc: pd.desc,
        weight: 14,
      });
  }
  if (!oneWeapon && p.weapons.length < maxW) {
    for (const id of BASE_WEAPON_IDS) {
      const owns = p.weapons.some(
        (w) => w.id === id || WEAPONS[id].evolvesTo === w.id,
      );
      if (!owns && !ban.has(id)) {
        const def = WEAPONS[id];
        cand.push({
          kind: "weapon-new",
          id,
          emoji: def.emoji,
          label: def.name,
          desc: "New weapon",
          weight: 12 * luck,
        });
      }
    }
  }
  if (Object.keys(p.passives).length < maxP) {
    for (const id of PASSIVE_IDS) {
      if (!(id in p.passives) && !ban.has(id)) {
        const pd = PASSIVES[id];
        // Strongly surface the partner passive of any maxed weapon — it's the last
        // piece of that weapon's evolution, so a focused build can complete it.
        const completesEvo = p.weapons.some((w) => {
          const d = WEAPONS[w.id];
          return (
            d &&
            !d.evolved &&
            d.requiresPassive === id &&
            w.level >= MAX_WEAPON_LEVEL
          );
        });
        cand.push({
          kind: "passive-new",
          id,
          emoji: pd.emoji,
          label: pd.name,
          desc: completesEvo ? pd.desc + " — unlocks evolution!" : pd.desc,
          weight: completesEvo ? 90 : 11 * luck,
        });
      }
    }
  }

  const bonus =
    state.rollRng.next() < Math.min(0.5, 0.05 + (luck - 1) * 0.4) ? 1 : 0;
  // Second Sight (witch): hands always show 4 cards (never 5 — UI is sized for 4).
  const want = Math.max(state.gimmick === "secondSight" ? 4 : 3, 3 + bonus);
  // Show evolutions first, but never let them crowd out every normal upgrade —
  // always reserve at least one slot for the weighted pool / reroll to act on.
  const chosen = forced.slice(0, Math.max(1, want - 1));
  while (chosen.length < want && cand.length)
    chosen.push(weightedTake(state.rollRng, cand));
  // Backfill a thin hand with DISTINCT fillers only — never show the same card twice.
  for (let fi = 0; fi < FILLERS.length && chosen.length < 3; fi++)
    chosen.push(FILLERS[fi]);
  return chosen;
}

// ── Co-op allies pick their own upgrades. Their hand is weapons-only (passives
// fold into the shared host stat block, so they stay host-side) + fillers.
// Uses rollRng, which solo runs never reach here — streams stay deterministic.
export const ALLY_WEAPON_SLOTS = 3;

export function allyLevelChoices(state, ally) {
  const cand = [];
  for (const w of ally.weapons) {
    const def = WEAPONS[w.id];
    if (def && w.level < MAX_WEAPON_LEVEL)
      cand.push({
        kind: "weapon-up",
        id: w.id,
        emoji: def.emoji,
        label: def.name + " ⮕ L" + (w.level + 1),
        desc: "Upgrade weapon",
        weight: 10 + w.level * 8,
      });
  }
  if (ally.weapons.length < ALLY_WEAPON_SLOTS) {
    for (const id of BASE_WEAPON_IDS) {
      if (!ally.weapons.some((w) => w.id === id)) {
        const def = WEAPONS[id];
        cand.push({
          kind: "weapon-new",
          id,
          emoji: def.emoji,
          label: def.name,
          desc: "New weapon",
          weight: 12,
        });
      }
    }
  }
  const chosen = [];
  while (chosen.length < 3 && cand.length)
    chosen.push(weightedTake(state.rollRng, cand));
  for (let fi = 0; fi < FILLERS.length && chosen.length < 3; fi++)
    chosen.push(FILLERS[fi]);
  return chosen;
}

export function applyAllyChoice(state, ally, c) {
  switch (c.kind) {
    case "weapon-new":
      if (
        ally.weapons.length < ALLY_WEAPON_SLOTS &&
        WEAPONS[c.id] &&
        !ally.weapons.some((w) => w.id === c.id)
      )
        ally.weapons.push({ id: c.id, level: 1, cd: 0, alt: 0, orbAngle: 0 });
      break;
    case "weapon-up": {
      const w = ally.weapons.find((x) => x.id === c.id);
      if (w && w.level < MAX_WEAPON_LEVEL) w.level += 1;
      break;
    }
    case "heal":
      ally.hp = Math.min(ally.maxHp, ally.hp + ally.maxHp * 0.4);
      break;
    case "coins":
      ally.coins += 20;
      break;
  }
}

export function applyChoice(state, c) {
  const p = state.player;
  switch (c.kind) {
    case "weapon-new":
      p.weapons.push({ id: c.id, level: 1, cd: 0, alt: 0, orbAngle: 0 });
      break;
    case "weapon-up": {
      const w = c.w || p.weapons.find((x) => x.id === c.id);
      const cap = state.modifiers
        ? state.modifiers.maxWeaponLevel
        : MAX_WEAPON_LEVEL;
      if (w && w.level < cap) w.level += 1;
      break;
    }
    case "passive-new":
      p.passives[c.id] = 1;
      recomputeStats(state);
      break;
    case "passive-up":
      p.passives[c.id] = (p.passives[c.id] || 0) + 1;
      recomputeStats(state);
      break;
    case "evolution":
      applyEvolution(state, c.evo);
      emit(state, "evolve");
      break;
    case "heal":
      p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.4);
      break;
    case "coins":
      p.coins += Math.round(20 * state.stats.greed);
      break;
  }
  if (state.pendingLevelUps > 0) state.pendingLevelUps -= 1;
  if (state.pendingLevelUps <= 0) {
    state.pendingLevelUps = 0;
    state.awaitingLevelUp = false;
  }
}
