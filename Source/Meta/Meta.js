// Account state wrapper over the save: coins, power-grid levels, best times, settings.
// Every mutation persists immediately. Reads are live getters so screens always
// reflect the latest save. (All characters are free — no unlock state.)
import { loadFrom, saveTo } from "./Save.js";
import { POWER_GRID } from "../Content/PowerGrid.js";
import { MOD_DEFS } from "../Content/Modifiers.js";

export function makeMeta(storage) {
  const data = loadFrom(storage);
  const persist = () => saveTo(storage, data);

  return {
    data,
    get coins() {
      return data.coins;
    },
    get powerGrid() {
      return data.powerGrid;
    },
    get bestTimes() {
      return data.bestTimes;
    },
    get settings() {
      return data.settings;
    },
    get plays() {
      return data.plays;
    },
    get wins() {
      return data.wins;
    },
    get bestScore() {
      return data.bestScore;
    },
    get lastModifiers() {
      return data.lastModifiers;
    },
    // A modifier is available once its play/win threshold is met (free = always).
    isModifierUnlocked(def) {
      const u = def.unlock || {};
      if (u.free) return true;
      if (u.wins != null) return data.wins >= u.wins;
      if (u.plays != null) return data.plays >= u.plays;
      return true;
    },
    // Unlocks newly crossed since `prevPlays`/`prevWins` — for the post-run toast.
    newlyUnlocked(prevPlays, prevWins) {
      const out = [];
      for (const id in MOD_DEFS) {
        const u = MOD_DEFS[id].unlock || {};
        if (u.wins != null && prevWins < u.wins && data.wins >= u.wins)
          out.push(MOD_DEFS[id]);
        else if (
          u.plays != null &&
          prevPlays < u.plays &&
          data.plays >= u.plays
        )
          out.push(MOD_DEFS[id]);
      }
      return out;
    },
    recordPlay(modifierSel) {
      data.plays += 1;
      data.lastModifiers = modifierSel || {};
      persist();
    },
    recordWin() {
      data.wins += 1;
      persist();
    },
    recordScore(score) {
      if (score > (data.bestScore || 0)) data.bestScore = Math.floor(score);
      persist();
    },
    gridLevel(stat) {
      return data.powerGrid[stat] || 0;
    },
    gridCost(stat) {
      const row = POWER_GRID[stat];
      const lvl = data.powerGrid[stat] || 0;
      return !row || lvl >= row.max ? null : row.cost(lvl);
    },
    buyGrid(stat) {
      const row = POWER_GRID[stat];
      if (!row) return false;
      const lvl = data.powerGrid[stat] || 0;
      if (lvl >= row.max) return false;
      const cost = row.cost(lvl);
      if (data.coins < cost) return false;
      data.coins -= cost;
      data.powerGrid[stat] = lvl + 1;
      persist();
      return true;
    },
    bankRun(runLength, earned, timeSurvived) {
      data.coins += Math.max(0, Math.round(earned));
      if (timeSurvived > (data.bestTimes[runLength] || 0))
        data.bestTimes[runLength] = Math.floor(timeSurvived);
      persist();
    },
    setSetting(key, value) {
      data.settings[key] = value;
      persist();
    },
  };
}
