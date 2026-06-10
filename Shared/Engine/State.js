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
    allies: [], // co-op remote players (empty in every solo/headless run)
    enemies: [],
    projectiles: [],
    gems: [],
    coins: [],
    drops: [], // health / chest / magnet pickups
    orbits: [], // persistent orbiting weapon bodies
    hazards: [], // one-shot burst visuals (explosion/whip), short-lived, render only
    auraViz: [], // steady player-centered aura glows (continuous weapons), render only
    strikes: [], // one-shot AoE damage events emitted by weapons, consumed by combat
    // fire defaults TRUE: headless (tests/probes) auto-fires; the FPS view layer
    // overwrites it each frame from the trigger (mouse / touch button / gamepad).
    input: { move: { x: 0, y: 0 }, aim: null, fire: true },
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
    devil: 0, // kill #666 horns: seconds left to show (counts down, then fades)
    awaitingLevelUp: startLevel > 1, // Head Start grants immediate picks
    pendingLevelUps: startLevel - 1,
    rerollsLeft: stats.rerolls,
    banishesLeft: 1 + stats.banishes, // remove offered cards from this run's pool
    banishedCards: new Set(), // card ids banished for the rest of the run
    autoFiller: null, // "heal"|"coins": locked filler auto-applied when the pool is dead
    currentChoices: null, // level-up hand in play (set by the view layer; gates reroll/banish)
    prevPlays: 0, // meta.plays at run start (set by the view layer, for the result screen)
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

// Co-op: remote players ride the host sim as lightweight allies — they move by
// their own networked input, fire their character's starter weapon (auto-leveled
// with the host), take contact damage, and get downed/respawn instead of ending
// the run. Every system gates on allies.length, so solo runs are untouched.
export function addAlly(state, { id, name, character }) {
  const a = {
    id,
    name: name || "Ally",
    character: character.id,
    emoji: character.emoji,
    x: state.player.x + 40 + state.allies.length * 34,
    y: state.player.y + 40,
    vx: 0,
    vy: 0,
    facing: { x: 0, y: 1 },
    hp: state.stats.maxHp,
    maxHp: state.stats.maxHp,
    invuln: 1,
    weapons: [{ id: character.weapon, level: 1, cd: 0, alt: 0 }],
    input: { move: { x: 0, y: 0 }, aim: null, fire: false },
    downed: false,
    respawnT: 0,
    coins: 0,
  };
  state.allies.push(a);
  return a;
}

export function removeAlly(state, id) {
  const i = state.allies.findIndex((a) => a.id === id);
  if (i < 0) return;
  const al = state.allies[i];
  // drop any orbit bodies the ally owned — nothing steps them once it's gone
  for (let k = state.orbits.length - 1; k >= 0; k--)
    if (state.orbits[k].owner === al) state.orbits.splice(k, 1);
  state.allies.splice(i, 1);
}
