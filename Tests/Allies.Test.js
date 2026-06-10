// Co-op ally sim: movement, aggro, contact damage + downed/respawn, trigger-
// gated ally weapons, and pickup crediting. Solo behavior is covered by every
// other suite (allies stays empty there).
import { describe, it, expect } from "./Runner.js";
import { createRunState, addAlly, removeAlly } from "../Source/Engine/State.js";
import {
  stepAllies,
  stepEnemies,
  movePlayer,
} from "../Source/Systems/Movement.js";
import { stepWeapons } from "../Source/Systems/WeaponSystem.js";
import { stepCombat } from "../Source/Systems/CombatSystem.js";
import { stepPickups } from "../Source/Systems/PickupSystem.js";
import { spawnEnemy } from "../Source/Systems/Spawner.js";
import { difficulty } from "../Source/Content/Curve.js";
import { ENEMIES } from "../Source/Content/Enemies.js";
import { CHARACTERS, STARTER_ID } from "../Source/Content/Characters.js";

const DT = 1 / 60;

function makeState() {
  return createRunState({
    seed: 11,
    runLength: 300,
    character: CHARACTERS[STARTER_ID],
  });
}

function ally(s, charId = "mage") {
  return addAlly(s, { id: "g1", name: "Guest", character: CHARACTERS[charId] });
}

function rebuildHash(s) {
  s.hash.clear();
  for (const e of s.enemies) s.hash.insert(e);
}

describe("Co-op allies", () => {
  it("addAlly shapes a live ally; stepAllies moves it by its input", () => {
    const s = makeState();
    const a = ally(s);
    expect(a.hp).toBe(s.stats.maxHp);
    a.input.move = { x: 1, y: 0 };
    const x0 = a.x;
    for (let i = 0; i < 60; i++) stepAllies(s, DT);
    expect(a.x - x0 > s.stats.speed * 0.9).toBeTruthy(); // ~1s of travel
  });

  it("enemies hunt the nearest live player, not always the host", () => {
    const s = makeState();
    const a = ally(s);
    a.x = 300;
    a.y = 0;
    const e = spawnEnemy(s, ENEMIES.zombie, 420, 0, difficulty(0));
    for (let i = 0; i < 60; i++) {
      rebuildHash(s);
      stepEnemies(s, DT);
    }
    const dAlly = Math.hypot(e.x - a.x, e.y - a.y);
    const dHost = Math.hypot(e.x - s.player.x, e.y - s.player.y);
    expect(dAlly < 120 - 1).toBeTruthy(); // closed in on the ally
    expect(dAlly < dHost).toBeTruthy(); // and ignored the farther host
  });

  it("contact downs an ally; it respawns at half HP beside the host", () => {
    const s = makeState();
    const a = ally(s);
    a.x = 500;
    a.y = 0;
    a.invuln = 0;
    a.hp = 1;
    const e = spawnEnemy(s, ENEMIES.zombie, 500, 0, difficulty(0));
    e.uid = 1;
    rebuildHash(s);
    stepCombat(s, DT);
    expect(a.downed).toBe(true);
    expect(s.outcome).toBe(null); // an ally down never ends the run
    for (let i = 0; i < Math.ceil(16 / DT); i++) stepAllies(s, DT);
    expect(a.downed).toBe(false);
    expect(a.hp).toBeCloseTo(a.maxHp * 0.5, 1e-6);
    expect(Math.hypot(a.x - s.player.x, a.y - s.player.y) < 120).toBeTruthy();
  });

  it("ally weapons are trigger-gated and fire from the ally's position", () => {
    const s = makeState();
    s.player.weapons = []; // isolate: only the ally shoots
    const a = ally(s, "mage"); // aimed bolt
    a.x = 900;
    a.y = 900;
    a.input.fire = false;
    for (let i = 0; i < 120; i++) stepWeapons(s, DT);
    expect(s.projectiles.length).toBe(0);
    a.input.fire = true;
    a.input.aim = { x: 1, y: 0 };
    stepWeapons(s, DT);
    expect(s.projectiles.length > 0).toBeTruthy();
    expect(Math.abs(s.projectiles[0].x - a.x) < 5).toBeTruthy();
  });

  it("coins go to the collecting ally; gems still level the host", () => {
    const s = makeState();
    const a = ally(s);
    a.x = 600;
    a.y = 0;
    s.coins.push({
      x: 600,
      y: 0,
      value: 3,
      vacuum: false,
      emoji: "🪙",
      size: 15,
    });
    s.gems.push(
      Object.assign(s.pool.gem.acquire(), {
        x: 600,
        y: 8,
        value: 5,
        vacuum: false,
        emoji: "💠",
        size: 15,
      }),
    );
    const xp0 = s.player.xp;
    stepPickups(s, DT);
    expect(a.coins > 0).toBeTruthy();
    expect(s.player.coins).toBe(0);
    expect(s.player.xp > xp0).toBeTruthy();
  });

  it("removeAlly drops the ally and its orbit bodies", () => {
    const s = makeState();
    const a = ally(s, "witch"); // orbit starter
    a.input.fire = true;
    stepWeapons(s, DT);
    expect(s.orbits.length > 0).toBeTruthy();
    removeAlly(s, "g1");
    expect(s.allies.length).toBe(0);
    expect(s.orbits.length).toBe(0);
  });

  it("solo runs keep an empty allies array (no system engages)", () => {
    const s = makeState();
    movePlayer(s, DT);
    stepAllies(s, DT);
    expect(s.allies.length).toBe(0);
  });
});

describe("Co-op ally upgrades", () => {
  it("allyLevelChoices deals 3 weapon-centric cards; picks apply", async () => {
    const { allyLevelChoices, applyAllyChoice } =
      await import("../Source/Systems/Leveling.js");
    const s = makeState();
    const a = ally(s, "mage");
    const hand = allyLevelChoices(s, a);
    expect(hand.length).toBe(3);
    const up = hand.find((c) => c.kind === "weapon-up");
    const nw = hand.find((c) => c.kind === "weapon-new");
    expect(!!(up || nw)).toBeTruthy();
    if (nw) {
      applyAllyChoice(s, a, nw);
      expect(a.weapons.length).toBe(2);
    }
    if (up) {
      const before = a.weapons.find((w) => w.id === up.id).level;
      applyAllyChoice(s, a, up);
      expect(a.weapons.find((w) => w.id === up.id).level).toBe(before + 1);
    }
    a.hp = 10;
    applyAllyChoice(s, a, { kind: "heal" });
    expect(a.hp > 10).toBeTruthy();
    const c0 = a.coins;
    applyAllyChoice(s, a, { kind: "coins" });
    expect(a.coins).toBe(c0 + 20);
  });
});
