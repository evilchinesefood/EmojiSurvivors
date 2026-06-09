// localStorage save schema + versioned migration. Bad/old/partial saves migrate
// forward and never crash — load always returns a complete, valid save. Storage is a
// {getItem,setItem} seam so it's node-testable with an in-memory stub.
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
    bestTimes: { 300: 0, 600: 0, 900: 0 },
    plays: 0, // runs started — gates some modifier unlocks
    wins: 0, // boss kills — gates the rest
    bestScore: 0, // best Endless score (kills + seconds)
    lastModifiers: {}, // remembered selection for the next run
    unlockedChars: [], // coin-bought character ids (free chars never appear here)
    records: [], // local leaderboard entries (see Records.js)
    playerName: "", // leaderboard handle
    tainted: false, // tamper flag — sticky once set
    settings: { sfx: 0.6, shake: true, damageNumbers: true, manualAim: false },
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
  // Only the three real run lengths, each coerced to a non-negative integer.
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

export function loadFrom(storage) {
  try {
    const s = storage && storage.getItem(SAVE_KEY);
    if (!s) return defaultSave();
    const raw = JSON.parse(s);
    const out = migrate(raw);
    // Verify on the raw string BEFORE migrate's silent clamping can mask an edit.
    const v =
      raw && typeof raw === "object" && Number.isFinite(+raw.version)
        ? +raw.version
        : 0;
    if (v >= 3 && storage.getItem(SIG_KEY) !== signature(s)) out.tainted = true;
    return out;
  } catch {
    return defaultSave();
  }
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
