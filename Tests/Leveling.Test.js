import { describe, it, expect } from "./Runner.js";
import { createRunState } from "../Shared/Engine/State.js";
import {
  stepLeveling,
  levelUpChoices,
  applyChoice,
} from "../Shared/Systems/Leveling.js";
import { CHARACTERS } from "../Shared/Content/Characters.js";

function run(charId = "knight") {
  return createRunState({
    seed: 3,
    runLength: 300,
    character: CHARACTERS[charId],
    powerGrid: {},
  });
}

describe("Leveling", () => {
  it("XP overflow levels up and queues a pick", () => {
    const s = run();
    s.player.xp = s.player.xpNext + 1;
    stepLeveling(s);
    expect(s.player.level).toBe(2);
    expect(s.pendingLevelUps).toBe(1);
    expect(s.awaitingLevelUp).toBe(true);
  });

  it("a huge XP gain queues multiple level-ups", () => {
    const s = run();
    s.player.xp = 500;
    stepLeveling(s);
    expect(s.pendingLevelUps > 1).toBeTruthy();
  });

  it("generates at least 3 distinct choices", () => {
    const s = run();
    const ch = levelUpChoices(s);
    expect(ch.length >= 3).toBeTruthy();
    const labels = new Set(ch.map((c) => c.label));
    expect(labels.size).toBe(ch.length);
  });

  it("a new passive re-resolves stats (Hollow Heart raises max HP)", () => {
    const s = run();
    const before = s.player.maxHp;
    applyChoice(s, { kind: "passive-new", id: "hollowHeart" });
    expect(s.player.maxHp > before).toBeTruthy();
    expect(s.player.passives.hollowHeart).toBe(1);
  });

  it("resolves queued picks one at a time", () => {
    const s = run();
    s.pendingLevelUps = 2;
    s.awaitingLevelUp = true;
    applyChoice(s, { kind: "heal" });
    expect(s.awaitingLevelUp).toBe(true);
    applyChoice(s, { kind: "heal" });
    expect(s.awaitingLevelUp).toBe(false);
  });

  it("Regrowth heals on level-up", () => {
    const s = run("druid");
    s.player.hp = 10;
    s.player.xp = s.player.xpNext + 1;
    stepLeveling(s);
    expect(s.player.hp > 10).toBeTruthy();
  });

  it("banished card ids never appear in subsequent choices", () => {
    const s = run();
    s.banishedCards.add("daggers");
    s.banishedCards.add("wings");
    for (let i = 0; i < 30; i++) {
      const ch = levelUpChoices(s);
      expect(
        ch.every((c) => c.id !== "daggers" && c.id !== "wings"),
      ).toBeTruthy();
      expect(ch.length >= 3).toBeTruthy();
    }
  });
});
