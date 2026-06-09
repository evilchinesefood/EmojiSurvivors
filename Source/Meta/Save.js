// localStorage save schema + versioned migration. Bad/old/partial saves migrate
// forward and never crash — load always returns a complete, valid save. Storage is a
// {getItem,setItem} seam so it's node-testable with an in-memory stub.
import { POWER_GRID } from "../Content/PowerGrid.js";

export const SAVE_KEY = "emojisurvivors-save";
export const SAVE_VERSION = 2;

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
    settings: { sfx: 0.6, shake: true, damageNumbers: true, manualAim: false },
  };
}

// Coerce any prior/garbage shape into the current schema, filling gaps from defaults.
export function migrate(raw) {
  const d = defaultSave();
  if (!raw || typeof raw !== "object") return d;
  const num = (v) => (Number.isFinite(+v) ? Math.max(0, Math.floor(+v)) : 0);
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
    return migrate(JSON.parse(s));
  } catch {
    return defaultSave();
  }
}

export function saveTo(storage, data) {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    /* storage full / unavailable — ignore, game still runs */
  }
}
