// Account state wrapper over the save: coins, power-grid levels, best times, settings.
// Every mutation persists immediately. Reads are live getters so screens always
// reflect the latest save. (All characters are free — no unlock state.)
import { loadFrom, saveTo } from "./Save.js";
import { POWER_GRID } from "../Content/PowerGrid.js";

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
