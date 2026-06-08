// Account state wrapper over the save: coins, unlocked characters, power-grid levels,
// best times, settings. Every mutation persists immediately. Reads are live getters
// so screens always reflect the latest save.
import { loadFrom, saveTo } from "./Save.js";
import { CHARACTERS } from "../Content/Characters.js";
import { POWER_GRID } from "../Content/PowerGrid.js";

export function makeMeta(storage) {
  const data = loadFrom(storage);
  const persist = () => saveTo(storage, data);

  return {
    data,
    get coins() {
      return data.coins;
    },
    get unlocked() {
      return data.unlockedCharacters;
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
    isUnlocked(id) {
      return data.unlockedCharacters.includes(id);
    },
    gridLevel(stat) {
      return data.powerGrid[stat] || 0;
    },
    gridCost(stat) {
      const row = POWER_GRID[stat];
      const lvl = data.powerGrid[stat] || 0;
      return !row || lvl >= row.max ? null : row.cost(lvl);
    },
    unlockCharacter(id) {
      const c = CHARACTERS[id];
      if (!c || this.isUnlocked(id) || data.coins < c.price) return false;
      data.coins -= c.price;
      data.unlockedCharacters.push(id);
      persist();
      return true;
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
