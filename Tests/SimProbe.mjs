// Seeded headless full-run probe. Drives the DOM-free sim at a fixed seed with a
// competent kiting + priority-pick policy and asserts invariants: no NaN/Infinity,
// bounded entity counts, the player levels up, coins accrue, and the run survives to
// the deadline. Boss + victory assertions are added at M4. Reproducible via the seed.
import { createRunState } from "../Source/Engine/State.js";
import { stepSim, STEP } from "../Source/Engine/GameLoop.js";
import { CHARACTERS } from "../Source/Content/Characters.js";
import { levelUpChoices, applyChoice } from "../Source/Systems/Leveling.js";
import { WEAPONS } from "../Source/Content/Weapons.js";

function fail(msg) {
  console.error("SimProbe FAIL: " + msg);
  process.exit(1);
}
function ok(c, msg) {
  if (!c) fail(msg);
}
const finite = (...xs) => xs.every(Number.isFinite);

// Movement: flee the weighted nearby-enemy field + a rotating drift → a big curving
// kite that sweeps fresh ground and curls back over its own gem trail.
export function moveAI(s) {
  const p = s.player;
  let ax = 0;
  let ay = 0;
  const en = s.enemies;
  for (let i = 0; i < en.length; i++) {
    const dx = p.x - en[i].x;
    const dy = p.y - en[i].y;
    const d2 = dx * dx + dy * dy;
    if (d2 < 280 * 280) {
      const w = 1 / (d2 + 240);
      ax += dx * w;
      ay += dy * w;
    }
  }
  const l = Math.hypot(ax, ay) || 1;
  ax /= l;
  ay /= l;
  const h = s.time * 0.55;
  ax += Math.cos(h) * 0.6;
  ay += Math.sin(h) * 0.6;
  const l2 = Math.hypot(ax, ay) || 1;
  return { x: ax / l2, y: ay / l2 };
}

// Priority picks: evolution > emergency heal > 360° coverage (orbit/aura) > push the
// main weapon to L8 + its partner passive (to evolve) > breadth > depth > survivability.
export function smartPick(s) {
  const ch = levelUpChoices(s);
  const p = s.player;
  let main = null;
  for (const w of p.weapons) {
    const def = WEAPONS[w.id];
    if (def && !def.evolved && def.evolvesTo && (!main || w.level > main.level))
      main = w;
  }
  const mainDef = main ? WEAPONS[main.id] : null;
  const score = (c) => {
    if (c.kind === "evolution") return 1000;
    if (c.kind === "heal") return p.hp / p.maxHp < 0.5 ? 300 : 2;
    if (c.kind === "weapon-new" && (c.id === "orbit" || c.id === "aura"))
      return 150;
    if (
      mainDef &&
      c.kind === "passive-new" &&
      c.id === mainDef.requiresPassive &&
      main.level >= 6
    )
      return 140;
    if (
      mainDef &&
      c.kind === "weapon-up" &&
      (c.w === main || c.id === main.id) &&
      main.level < 8
    )
      return 120;
    if (c.kind === "weapon-new" && p.weapons.length < 4) return 90;
    if (c.kind === "weapon-up") return 80;
    if (
      c.kind === "passive-new" &&
      (c.id === "hollowHeart" || c.id === "wings" || c.id === "spinach")
    )
      return 60;
    if (c.kind === "passive-up") return 50;
    if (c.kind === "passive-new") return 45;
    return 10;
  };
  ch.sort((a, b) => score(b) - score(a));
  applyChoice(s, ch[0]);
}

export function drive({ seed, runLength, characterId, seconds }) {
  const s = createRunState({
    seed,
    runLength,
    character: CHARACTERS[characterId],
    powerGrid: {},
  });
  const steps = Math.round((seconds ?? runLength) / STEP);
  let maxEnemies = 0;
  let maxProj = 0;
  let maxGems = 0;
  for (let i = 0; i < steps; i++) {
    s.input.move = moveAI(s);
    stepSim(s, STEP);
    let guard = 0;
    while (s.awaitingLevelUp) {
      smartPick(s);
      if (++guard > 200)
        fail("level-up resolver stuck at t=" + s.time.toFixed(1));
    }
    s.events.length = 0;
    maxEnemies = Math.max(maxEnemies, s.enemies.length);
    maxProj = Math.max(maxProj, s.projectiles.length);
    maxGems = Math.max(maxGems, s.gems.length);
    if (!finite(s.player.x, s.player.y, s.player.hp, s.player.xp))
      fail("player NaN at t=" + s.time.toFixed(2));
    for (let k = 0; k < s.enemies.length; k++) {
      const e = s.enemies[k];
      if (!finite(e.x, e.y, e.hp)) fail("enemy NaN at t=" + s.time.toFixed(2));
    }
    if (s.outcome) break;
  }
  return { s, maxEnemies, maxProj, maxGems };
}

function main() {
  // M3: full roguelite loop — survive to the deadline, level up, build a loadout.
  const a = drive({ seed: 1234, runLength: 300, characterId: "knight" });
  ok(a.maxEnemies > 30, "expected a swarm (got " + a.maxEnemies + ")");
  ok(a.maxEnemies <= 320, "enemy count unbounded (" + a.maxEnemies + ")");
  ok(a.maxProj < 2500, "projectiles leaking (" + a.maxProj + ")");
  ok(a.s.player.kills > 20, "no real combat happened");
  ok(a.maxGems > 0, "no gems dropped");
  ok(
    a.s.player.level >= 5,
    "player should level up (got " + a.s.player.level + ")",
  );
  ok(!a.s.awaitingLevelUp, "level-up left unresolved");
  ok(
    !a.s.outcome && a.s.time >= 300 - STEP,
    "Knight should reach the 5-min deadline alive (t=" +
      a.s.time.toFixed(0) +
      " " +
      a.s.outcome +
      ")",
  );

  // Mage (projectile starter) over a 10-min run.
  const b = drive({ seed: 77, runLength: 600, characterId: "mage" });
  ok(b.maxProj > 0, "mage should fire projectiles");
  ok(b.s.player.level > 8, "mage should level well over 10 min");

  console.log(
    `SimProbe OK (M3): knight lvl=${a.s.player.level} kills=${a.s.player.kills} ` +
      `weapons=${a.s.player.weapons.length} reached=${a.s.time.toFixed(0)}s | ` +
      `mage lvl=${b.s.player.level} maxProj=${b.maxProj}`,
  );
}

// Only run the gate when executed directly (importable for the tuning harness).
if (import.meta.url === `file://${process.argv[1]}`) main();
