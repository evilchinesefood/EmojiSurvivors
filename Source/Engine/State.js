// The run state container — one plain, DOM-free, mutable object. Built fresh per
// run from a character + run length + the account power grid. Systems mutate it in
// place each fixed step; the renderer/UI read it; the probe drives it headless.
import { makeRng, mixSeed } from "./Rng.js";
import { resolve, magnetRadius, pickupRadius } from "../Systems/StatsModel.js";
import { xpForLevel } from "../Content/Curve.js";
import { makeSpatialHash } from "../World/SpatialHash.js";
import { makePool } from "../World/Pool.js";
import { resolveModifiers } from "../Content/Modifiers.js";

// Swap-pop removal: O(1), order-independent (fine for unordered entity arrays).
export function swapPop(arr, i) {
  const last = arr.length - 1;
  if (i !== last) arr[i] = arr[last];
  arr.pop();
}

export function createRunState({
  seed,
  runLength,
  character,
  powerGrid = {},
  modifiers = {},
  tainted = false,
  seasonal = {},
}) {
  const mods = resolveModifiers(modifiers);
  if (seasonal.friday13) mods.spawnMul *= 1.13; // unlucky night

  const stats = resolve(character.tilt.concat(mods.statMods), {}, powerGrid);
  stats.revives = Math.max(0, stats.revives + mods.extraRevives);
  const startLevel = mods.startLevel;
  const player = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    hp: stats.maxHp,
    maxHp: stats.maxHp,
    invuln: 0,
    facing: { x: 0, y: 1 },
    level: startLevel,
    xp: 0,
    xpNext: xpForLevel(startLevel),
    weapons: [
      {
        id: character.weapon,
        level: 1 + stats.weaponStartLevel,
        cd: 0,
        alt: 0,
      },
    ],
    passives: {},
    kills: 0,
    coins: 0,
    revivesUsed: 0,
    magnetR: magnetRadius(stats),
    pickupR: pickupRadius(stats),
    hitFlash: 0,
  };
  return {
    seed: seed >>> 0,
    runLength,
    time: 0,
    character,
    gimmick: character.gimmick,
    stats,
    powerGrid,
    player,
    spawnRng: makeRng(seed),
    rollRng: makeRng(mixSeed(seed, 0x9e3779b9)),
    combatRng: makeRng(mixSeed(seed, 0x85ebca6b)),
    hash: makeSpatialHash(72),
    pool: {
      enemy: makePool(() => ({ hitTimers: {} })),
      proj: makePool(() => ({ hitIds: new Set() })),
      gem: makePool(() => ({})),
    },
    neighbors: [], // scratch array reused by hash queries
    enemies: [],
    projectiles: [],
    gems: [],
    coins: [],
    drops: [], // health / chest / magnet pickups
    orbits: [], // persistent orbiting weapon bodies
    hazards: [], // one-shot burst visuals (explosion/whip), short-lived, render only
    auraViz: [], // steady player-centered aura glows (continuous weapons), render only
    strikes: [], // one-shot AoE damage events emitted by weapons, consumed by combat
    input: { move: { x: 0, y: 0 }, aim: null },
    events: [],
    modifiers: mods,
    modifierSel: modifiers, // raw selection, for restart + result display
    endless: mods.endless,
    tainted: !!tainted, // tampered save → Clown Mode penalties this run
    // The Auditor: an untouchable observer that shadows tainted players.
    auditor: tainted ? { x: -420, y: -320, whisperT: 12 } : null,
    seasonal: {
      halloween: !!seasonal.halloween,
      friday13: !!seasonal.friday13,
    },
    // Graveyard Cat: 1-in-40 seeds gains a cosmetic companion (no RNG consumed).
    cat: seed % 40 === 13 ? { x: -70, y: -50 } : null,
    devil: false, // set at kill #666 — cosmetic horns for the rest of the run
    awaitingLevelUp: startLevel > 1, // Head Start grants immediate picks
    pendingLevelUps: startLevel - 1,
    rerollsLeft: stats.rerolls,
    banishesLeft: 1 + stats.banishes, // remove offered cards from this run's pool
    banishedCards: new Set(), // card ids banished for the rest of the run
    autoFiller: null, // "heal"|"coins": locked filler auto-applied when the pool is dead
    entitySeq: 0, // monotonic id for pooled enemies (projectile hit-tracking)
    outcome: null, // 'victory' | 'gameover'
    spawn: {
      timer: 0.8, // brief grace before the first trickle
      waveTimer: 12, // first ring wave a touch later, so the open is gentler
      eliteTimers: { ogre: 28, lich: 36 }, // staggered per-elite spawn timers
      bossSpawned: false,
      bossAlive: false,
    },
  };
}

export function emit(state, type, data) {
  state.events.push(data ? { type, ...data } : { type });
}
