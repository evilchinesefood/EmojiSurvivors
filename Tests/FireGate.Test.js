// FPS trigger gating: weapons hold ready while input.fire is false, fire when
// pressed, and default to auto-fire (back-compat for headless sims + probes).
import { describe, it, expect } from "./Runner.js";
import { createRunState } from "../Source/Engine/State.js";
import { stepWeapons } from "../Source/Systems/WeaponSystem.js";
import { WEAPONS } from "../Source/Content/Weapons.js";
import { CHARACTERS, STARTER_ID } from "../Source/Content/Characters.js";

const aimedId = Object.keys(WEAPONS).find(
  (k) => WEAPONS[k].behavior === "aimed" && !WEAPONS[k].evolved,
);
const auraId = Object.keys(WEAPONS).find(
  (k) => WEAPONS[k].behavior === "aura" && !WEAPONS[k].evolved,
);

function state(weaponId) {
  const s = createRunState({
    seed: 7,
    runLength: 300,
    character: CHARACTERS[STARTER_ID],
  });
  s.player.weapons = [{ id: weaponId, level: 1, cd: 0, alt: 0 }];
  return s;
}

describe("FPS trigger gating", () => {
  it("fire defaults true — auto-fire is unchanged for headless sims", () => {
    const s = state(aimedId);
    expect(s.input.fire).toBe(true);
    stepWeapons(s, 1 / 60);
    expect(s.projectiles.length > 0).toBeTruthy();
  });

  it("aimed weapons hold ready while fire=false, shoot the step it's pressed", () => {
    const s = state(aimedId);
    s.input.fire = false;
    for (let i = 0; i < 120; i++) stepWeapons(s, 1 / 60);
    expect(s.projectiles.length).toBe(0);
    s.input.fire = true;
    stepWeapons(s, 1 / 60);
    expect(s.projectiles.length > 0).toBeTruthy();
  });

  it("holding fire keeps the cooldown cadence (no burst banking)", () => {
    const s = state(aimedId);
    s.input.fire = false;
    for (let i = 0; i < 120; i++) stepWeapons(s, 1 / 60);
    s.input.fire = true;
    stepWeapons(s, 1 / 60);
    const burst = s.projectiles.length; // one volley, not 2s of banked volleys
    stepWeapons(s, 1 / 60);
    expect(s.projectiles.length).toBe(burst); // next volley waits a full interval
  });

  it("the passive aura pulses regardless of the trigger", () => {
    const s = state(auraId);
    s.input.fire = false;
    for (let i = 0; i < 120; i++) stepWeapons(s, 1 / 60);
    expect(s.strikes.length > 0).toBeTruthy();
  });
});
