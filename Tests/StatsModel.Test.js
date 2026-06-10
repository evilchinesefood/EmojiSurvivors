import { describe, it, expect } from "./Runner.js";
import {
  resolve,
  BASE_MAXHP,
  BASE_SPEED,
} from "../Shared/Systems/StatsModel.js";
import { CHARACTERS } from "../Shared/Content/Characters.js";

describe("StatsModel.resolve", () => {
  it("returns sane defaults for an empty build", () => {
    const s = resolve([], {}, {});
    expect(s.might).toBe(1);
    expect(s.maxHp).toBe(BASE_MAXHP);
    expect(s.speed).toBe(BASE_SPEED);
    expect(s.armor).toBe(0);
    expect(s.projCount).toBe(0);
  });

  it("folds character tilt (Knight: +10% HP, +1 armor)", () => {
    const s = resolve(CHARACTERS.knight.tilt, {}, {});
    expect(s.maxHp).toBe(Math.round(BASE_MAXHP * 1.1));
    expect(s.armor).toBe(1);
  });

  it("Mage tilt compounds might up, HP down", () => {
    const s = resolve(CHARACTERS.mage.tilt, {}, {});
    expect(s.might).toBeCloseTo(1.2, 1e-9);
    expect(s.maxHp).toBe(Math.round(BASE_MAXHP * 0.8));
  });

  it("passives fold per level (multiplicative compound)", () => {
    const s = resolve([], { spellFocus: 2 }, {});
    expect(s.cooldown).toBeCloseTo(1.08 * 1.08, 1e-9);
  });

  it("additive passives stack (Bracer → +projCount)", () => {
    const s = resolve([], { bracer: 3 }, {});
    expect(s.projCount).toBe(3);
  });

  it("power grid folds on top of tilt + passives", () => {
    const s = resolve(CHARACTERS.mage.tilt, { spinach: 1 }, { might: 2 });
    expect(s.might).toBeCloseTo(1.2 * 1.1 * 1.05 * 1.05, 1e-9);
  });

  it("revives + rerolls come through additively", () => {
    const s = resolve([], {}, { revive: 1, reroll: 2 });
    expect(s.revives).toBe(1);
    expect(s.rerolls).toBe(2);
  });

  it("Iron Skin adds flat armor per level (stacks with tilt)", () => {
    expect(resolve([], { ironSkin: 2 }, {}).armor).toBe(2);
    expect(resolve(CHARACTERS.knight.tilt, { ironSkin: 1 }, {}).armor).toBe(2);
  });

  it("Lucky Charm folds luck and greed together", () => {
    const s = resolve([], { luckyCharm: 3 }, {});
    expect(s.luck).toBeCloseTo(Math.pow(1.1, 3), 1e-9);
    expect(s.greed).toBeCloseTo(Math.pow(1.06, 3), 1e-9);
  });
});
