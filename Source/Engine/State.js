// The run state container — one plain, DOM-free, mutable object. Built fresh per
// run from a character + run length + the account power grid. Systems mutate it in
// place each fixed step; the renderer/UI read it; the probe drives it headless.
import { makeRng, mixSeed } from "./Rng.js";
import { resolve, magnetRadius, pickupRadius } from "../Systems/StatsModel.js";
import { xpForLevel } from "../Content/Curve.js";
import { makeSpatialHash } from "../World/SpatialHash.js";
import { makePool } from "../World/Pool.js";

// Swap-pop removal: O(1), order-independent (fine for unordered entity arrays).
export function swapPop(arr, i) {
  const last = arr.length - 1;
  if (i !== last) arr[i] = arr[last];
  arr.pop();
}

export function createRunState({ seed, runLength, character, powerGrid = {} }) {
  const stats = resolve(character.tilt, {}, powerGrid);
  const player = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    hp: stats.maxHp,
    maxHp: stats.maxHp,
    invuln: 0,
    facing: { x: 0, y: 1 },
    level: 1,
    xp: 0,
    xpNext: xpForLevel(1),
    weapons: [{ id: character.weapon, level: 1, cd: 0, alt: 0 }],
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
    hazards: [], // aura/explosion zones (render only, short-lived)
    strikes: [], // one-shot AoE damage events emitted by weapons, consumed by combat
    input: { move: { x: 0, y: 0 } },
    events: [],
    awaitingLevelUp: false,
    pendingLevelUps: 0,
    rerollsLeft: stats.rerolls,
    outcome: null, // 'victory' | 'gameover'
    spawn: {
      timer: 0.4,
      waveTimer: 8,
      eliteTimer: 28,
      bossSpawned: false,
      bossAlive: false,
    },
    stats_kills: 0,
  };
}

export function emit(state, type, data) {
  state.events.push(data ? { type, ...data } : { type });
}
