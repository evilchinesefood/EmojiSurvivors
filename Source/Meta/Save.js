// localStorage save schema + versioned migration. Bad/old/partial saves migrate
// forward and never crash — load always returns a complete, valid save. Storage is a
// {getItem,setItem} seam so it's node-testable with an in-memory stub.
export const SAVE_KEY = "emojisurvivors-save";
export const SAVE_VERSION = 1;

export function defaultSave() {
  return {
    version: SAVE_VERSION,
    coins: 0,
    powerGrid: {},
    bestTimes: { 300: 0, 600: 0, 900: 0 },
    settings: { sfx: 0.6, shake: true, damageNumbers: true },
  };
}

// Coerce any prior/garbage shape into the current schema, filling gaps from defaults.
export function migrate(raw) {
  const d = defaultSave();
  if (!raw || typeof raw !== "object") return d;
  return {
    version: SAVE_VERSION,
    coins: Number.isFinite(raw.coins) ? Math.max(0, Math.floor(raw.coins)) : 0,
    powerGrid:
      raw.powerGrid && typeof raw.powerGrid === "object"
        ? { ...raw.powerGrid }
        : {},
    bestTimes: {
      ...d.bestTimes,
      ...(raw.bestTimes && typeof raw.bestTimes === "object"
        ? raw.bestTimes
        : {}),
    },
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
