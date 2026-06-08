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
  const stats = resolve(state.character.tilt, p.passives, state.powerGrid);
  const oldMax = p.maxHp;
  state.stats = stats;
  p.maxHp = stats.maxHp;
  if (stats.maxHp > oldMax)
    p.hp = Math.min(stats.maxHp, p.hp + (stats.maxHp - oldMax));
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

  // Evolutions are forced to the front — rare and exciting, never buried.
  const forced = eligibleEvolutions(state).map((evo) => ({
    kind: "evolution",
    id: evo.to,
    evo,
    emoji: WEAPONS[evo.to].emoji,
    label: WEAPONS[evo.to].name,
    desc: "Evolve " + WEAPONS[evo.from].name,
  }));

  for (const w of p.weapons) {
    const def = WEAPONS[w.id];
    if (def && w.level < MAX_WEAPON_LEVEL)
      cand.push({
        kind: "weapon-up",
        id: w.id,
        w,
        emoji: def.emoji,
        label: def.name + " ⮕ L" + (w.level + 1),
        desc: "Upgrade weapon",
        weight: 10,
      });
  }
  for (const id in p.passives) {
    const pd = PASSIVES[id];
    if (pd && p.passives[id] < pd.max)
      cand.push({
        kind: "passive-up",
        id,
        emoji: pd.emoji,
        label: pd.name + " ⮕ L" + (p.passives[id] + 1),
        desc: pd.desc,
        weight: 9,
      });
  }
  if (p.weapons.length < WEAPON_SLOTS) {
    for (const id of BASE_WEAPON_IDS) {
      const owns = p.weapons.some(
        (w) => w.id === id || WEAPONS[id].evolvesTo === w.id,
      );
      if (!owns) {
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
  if (Object.keys(p.passives).length < PASSIVE_SLOTS) {
    for (const id of PASSIVE_IDS) {
      if (!(id in p.passives)) {
        const pd = PASSIVES[id];
        cand.push({
          kind: "passive-new",
          id,
          emoji: pd.emoji,
          label: pd.name,
          desc: pd.desc,
          weight: 11 * luck,
        });
      }
    }
  }

  const want =
    3 + (state.rollRng.next() < Math.min(0.5, (luck - 1) * 0.4) ? 1 : 0);
  const chosen = forced.slice(0, want);
  while (chosen.length < want && cand.length)
    chosen.push(weightedTake(state.rollRng, cand));
  let fi = 0;
  while (chosen.length < 3) chosen.push(FILLERS[fi++ % FILLERS.length]);
  return chosen;
}

export function applyChoice(state, c) {
  const p = state.player;
  switch (c.kind) {
    case "weapon-new":
      p.weapons.push({ id: c.id, level: 1, cd: 0, alt: 0, orbAngle: 0 });
      break;
    case "weapon-up": {
      const w = c.w || p.weapons.find((x) => x.id === c.id);
      if (w && w.level < MAX_WEAPON_LEVEL) w.level += 1;
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
