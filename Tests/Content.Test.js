import { describe, it, expect } from "./Runner.js";
import { WEAPONS, BASE_WEAPON_IDS } from "../Source/Content/Weapons.js";
import { PASSIVES } from "../Source/Content/Passives.js";
import { CHARACTERS, CHARACTER_IDS } from "../Source/Content/Characters.js";
import { ENEMIES, NORMAL_TIERS, ELITE_IDS } from "../Source/Content/Enemies.js";

describe("Content additions", () => {
  it("Bone Spear → Soul Reaper evolution chain is wired", () => {
    expect(WEAPONS.boneSpear).toBeTruthy();
    expect(WEAPONS.boneSpear.evolvesTo).toBe("soulReaper");
    expect(WEAPONS.boneSpear.requiresPassive).toBe("graveDust");
    expect(WEAPONS.soulReaper.evolved).toBe(true);
    expect(WEAPONS.soulReaper.lifesteal > 0).toBeTruthy();
    expect(BASE_WEAPON_IDS.includes("boneSpear")).toBeTruthy();
    expect(BASE_WEAPON_IDS.includes("soulReaper")).toBe(false);
    expect(PASSIVES.graveDust).toBeTruthy();
  });

  it("Necromancer character starts with boneSpear + bloodPact", () => {
    expect(CHARACTER_IDS.includes("necromancer")).toBeTruthy();
    expect(CHARACTERS.necromancer.weapon).toBe("boneSpear");
    expect(CHARACTERS.necromancer.gimmick).toBe("bloodPact");
    expect(WEAPONS[CHARACTERS.necromancer.weapon]).toBeTruthy();
  });

  it("every character's starting weapon exists", () => {
    for (const id of CHARACTER_IDS)
      expect(WEAPONS[CHARACTERS[id].weapon]).toBeTruthy();
  });

  it("Specter (normal) + Lich (elite) enemies are registered correctly", () => {
    expect(ENEMIES.specter).toBeTruthy();
    expect(NORMAL_TIERS.includes("specter")).toBeTruthy();
    expect(ENEMIES.lich.elite).toBe(true);
    expect(ELITE_IDS.includes("lich")).toBeTruthy();
    expect(ELITE_IDS.includes("ogre")).toBeTruthy();
    // the boss id "wraith" must NOT collide with a normal enemy id
    expect(ENEMIES.wraith).toBe(undefined);
  });
});
