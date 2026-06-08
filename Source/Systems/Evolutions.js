// Weapon evolutions. A base weapon is eligible when it hits max level AND the player
// holds its required passive (any level). Choosing it swaps the weapon def in place
// (keeps the slot + level). Pure + DOM-free.
import { WEAPONS, MAX_WEAPON_LEVEL } from "../Content/Weapons.js";

export function eligibleEvolutions(state) {
  const out = [];
  for (const w of state.player.weapons) {
    const def = WEAPONS[w.id];
    if (!def || def.evolved || !def.evolvesTo) continue;
    if (
      w.level >= MAX_WEAPON_LEVEL &&
      state.player.passives[def.requiresPassive]
    ) {
      out.push({ weapon: w, from: def.id, to: def.evolvesTo });
    }
  }
  return out;
}

export function applyEvolution(state, evo) {
  evo.weapon.id = evo.to;
  evo.weapon.cd = 0;
}
