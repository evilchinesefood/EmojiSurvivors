// localStorage save schema + versioned migration. Bad/old/partial saves migrate
// forward and never crash — load always returns a complete, valid save. Storage is a
// {getItem,setItem} seam so it's node-testable with an in-memory stub.
//
// SHARED SAVE: the 2D and 3D versions live on the same origin and share this key —
// coins, power grid, character unlocks, best times, and local records carry across.
// Settings hold the union of both versions' keys (each UI only surfaces its own).
// The 3D version briefly kept its own save under emojisurvivors3d-*; loadFrom folds
// that into the shared save once, then deletes the legacy keys.
//
// Tamper detection: the save is stored with a sibling FNV-1a signature over the
// exact serialized string. v3+ saves with a missing/wrong signature load TAINTED —
// the game keeps working, but Clown Mode has opinions. Pre-signing saves (v<=2) get
// a one-time amnesty and are signed on their next persist. The taint flag itself
// persists (and gets signed), so it sticks until the save is wiped.
import { POWER_GRID } from "../Content/PowerGrid.js";
import { CHARACTERS } from "../Content/Characters.js";

export const SAVE_KEY = "emojisurvivors-save";
export const SIG_KEY = "emojisurvivors-save-sig";
const LEGACY3D_KEY = "emojisurvivors3d-save";
const LEGACY3D_SIG = "emojisurvivors3d-save-sig";
export const SAVE_VERSION = 3;
const SALT = "the-game-knows-what-you-did";

// FNV-1a 32-bit over body+salt. Not cryptography — a comedy deterrent: the salt is
// readable in source, and that's fine.
export function signature(body) {
  let h = 0x811c9dc5;
  const s = body + SALT;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

export function defaultSave() {
  return {
    version: SAVE_VERSION,
    coins: 0,
    powerGrid: {},
    bestTimes: { 300: 0, 600: 0, 900: 0, 1800: 0 },
    plays: 0, // runs started — gates some modifier unlocks
    wins: 0, // boss kills — gates the rest
    bestScore: 0, // best Endless score (kills + seconds)
    lastModifiers: {}, // remembered selection for the next run
    unlockedChars: [], // coin-bought character ids (free chars never appear here)
    records: [], // local leaderboard entries (see Records.js)
    playerName: "", // leaderboard handle
    tainted: false, // tamper flag — sticky once set
    settings: {
      sfx: 0.6,
      shake: true,
      damageNumbers: true,
      manualAim: false, // 2D
      sensitivity: 1, // 3D
      autoFire: false, // 3D
    },
  };
}

// Coerce any prior/garbage shape into the current schema, filling gaps from defaults.
export function migrate(raw) {
  const d = defaultSave();
  if (!raw || typeof raw !== "object") return d;
  const num = (v) => (Number.isFinite(+v) ? Math.max(0, Math.floor(+v)) : 0);
  const str = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");
  // Keep only known grid stats, clamp each to its row max (drops corrupt/unknown keys).
  const cleanGrid = (g) => {
    const out = {};
    if (g && typeof g === "object")
      for (const k in POWER_GRID) {
        const v = num(g[k]);
        if (v > 0) out[k] = Math.min(v, POWER_GRID[k].max);
      }
    return out;
  };
  // Only the four real run lengths (300/600/900/1800), each a non-negative integer.
  const cleanTimes = (b) => {
    const out = { ...d.bestTimes };
    if (b && typeof b === "object") for (const k in out) out[k] = num(b[k]);
    return out;
  };
  // Only purchasable, existing character ids.
  const cleanChars = (a) =>
    Array.isArray(a)
      ? [...new Set(a)].filter((id) => CHARACTERS[id] && CHARACTERS[id].cost)
      : [];
  const cleanRecords = (r) => {
    if (!Array.isArray(r)) return [];
    const out = [];
    for (const e of r) {
      if (!e || typeof e !== "object") continue;
      out.push({
        date: num(e.date),
        runLength: num(e.runLength),
        endless: !!e.endless,
        hard: !!e.hard,
        won: !!e.won,
        score: num(e.score),
        time: num(e.time),
        kills: num(e.kills),
        level: num(e.level),
        character: str(e.character, 24),
        mods: Array.isArray(e.mods)
          ? e.mods.filter((m) => typeof m === "string").slice(0, 24)
          : [],
      });
      if (out.length >= 200) break;
    }
    return out;
  };
  return {
    version: SAVE_VERSION,
    coins: num(raw.coins),
    powerGrid: cleanGrid(raw.powerGrid),
    bestTimes: cleanTimes(raw.bestTimes),
    plays: num(raw.plays),
    wins: num(raw.wins),
    bestScore: num(raw.bestScore),
    lastModifiers:
      raw.lastModifiers && typeof raw.lastModifiers === "object"
        ? { ...raw.lastModifiers }
        : {},
    unlockedChars: cleanChars(raw.unlockedChars),
    records: cleanRecords(raw.records),
    playerName: str(raw.playerName, 24),
    tainted: !!raw.tainted,
    settings: {
      ...d.settings,
      ...(raw.settings && typeof raw.settings === "object" ? raw.settings : {}),
    },
  };
}

// Fold two migrated saves into one (used once, for the legacy 3D split-save):
// additive counters, best-of records/times/grid, union unlocks, sticky taint.
export function mergeSaves(a, b) {
  const grid = { ...a.powerGrid };
  for (const k in b.powerGrid) grid[k] = Math.max(grid[k] || 0, b.powerGrid[k]);
  const times = { ...a.bestTimes };
  for (const k in b.bestTimes)
    times[k] = Math.max(times[k] || 0, b.bestTimes[k]);
  return {
    ...a,
    coins: a.coins + b.coins,
    powerGrid: grid,
    bestTimes: times,
    plays: a.plays + b.plays,
    wins: a.wins + b.wins,
    bestScore: Math.max(a.bestScore, b.bestScore),
    unlockedChars: [...new Set([...a.unlockedChars, ...b.unlockedChars])],
    records: [...a.records, ...b.records].slice(0, 200),
    playerName: a.playerName || b.playerName,
    tainted: a.tainted || b.tainted,
    // a (the shared/2D save) wins shared keys, but the 3D-flavored settings
    // follow b (the legacy 3D save) — migrate() fills defaults into both, so a
    // plain spread would clobber the player's real 3D values with defaults.
    settings: {
      ...b.settings,
      ...a.settings,
      sensitivity: b.settings.sensitivity,
      autoFire: b.settings.autoFire,
    },
  };
}

// Verify a raw stored string's sibling signature (v3+ saves only).
function verified(storage, raw, sigKey) {
  try {
    const j = JSON.parse(raw);
    const v =
      j && typeof j === "object" && Number.isFinite(+j.version)
        ? +j.version
        : 0;
    return v < 3 || storage.getItem(sigKey) === signature(raw);
  } catch {
    return false;
  }
}

export function loadFrom(storage) {
  let out;
  try {
    const s = storage && storage.getItem(SAVE_KEY);
    if (s) {
      out = migrate(JSON.parse(s));
      if (!verified(storage, s, SIG_KEY)) out.tainted = true;
    } else out = defaultSave();
  } catch {
    out = defaultSave();
  }
  // One-time fold of the short-lived separate 3D save into the shared one.
  try {
    const leg = storage && storage.getItem(LEGACY3D_KEY);
    if (leg) {
      const l = migrate(JSON.parse(leg));
      if (!verified(storage, leg, LEGACY3D_SIG)) l.tainted = true;
      out = storage.getItem(SAVE_KEY) ? mergeSaves(out, l) : l;
      saveTo(storage, out);
      storage.removeItem?.(LEGACY3D_KEY);
      storage.removeItem?.(LEGACY3D_SIG);
    }
  } catch {
    /* corrupt legacy blob — the shared save stands */
  }
  return out;
}

export function saveTo(storage, data) {
  try {
    const body = JSON.stringify(data);
    storage.setItem(SAVE_KEY, body);
    storage.setItem(SIG_KEY, signature(body));
  } catch {
    /* storage full / unavailable — ignore, game still runs */
  }
}
