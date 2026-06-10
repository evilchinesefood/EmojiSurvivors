import { describe, it, expect } from "./Runner.js";
import { createRunState } from "../Shared/Engine/State.js";
import {
  eligibleEvolutions,
  applyEvolution,
} from "../Shared/Systems/Evolutions.js";
import { levelUpChoices } from "../Shared/Systems/Leveling.js";
import { CHARACTERS } from "../Shared/Content/Characters.js";
import { MAX_WEAPON_LEVEL } from "../Shared/Content/Weapons.js";

function run() {
  // Mage starts with Magic Bolt → Bolt Storm via Spell Focus.
  return createRunState({
    seed: 8,
    runLength: 300,
    character: CHARACTERS.mage,
    powerGrid: {},
  });
}

describe("Evolutions", () => {
  it("is not eligible before max level + passive", () => {
    const s = run();
    expect(eligibleEvolutions(s).length).toBe(0);
    s.player.weapons[0].level = MAX_WEAPON_LEVEL;
    expect(eligibleEvolutions(s).length).toBe(0); // still missing passive
  });

  it("is eligible at L8 holding the required passive", () => {
    const s = run();
    s.player.weapons[0].level = MAX_WEAPON_LEVEL;
    s.player.passives.spellFocus = 1;
    const evos = eligibleEvolutions(s);
    expect(evos.length).toBe(1);
    expect(evos[0].to).toBe("boltStorm");
  });

  it("applying an evolution swaps the weapon in place", () => {
    const s = run();
    s.player.weapons[0].level = MAX_WEAPON_LEVEL;
    s.player.passives.spellFocus = 1;
    applyEvolution(s, eligibleEvolutions(s)[0]);
    expect(s.player.weapons[0].id).toBe("boltStorm");
    expect(s.player.weapons[0].level).toBe(MAX_WEAPON_LEVEL);
  });

  it("surfaces as a level-up choice when eligible", () => {
    const s = run();
    s.player.weapons[0].level = MAX_WEAPON_LEVEL;
    s.player.passives.spellFocus = 1;
    const hasEvo = levelUpChoices(s).some((c) => c.kind === "evolution");
    expect(hasEvo).toBeTruthy();
  });
});
