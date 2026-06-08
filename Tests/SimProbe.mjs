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
  // Boss phase: strafe around the boss at engage range so directional weapons land.
  if (s.spawn.bossSpawned) {
    let boss = null;
    for (const e of s.enemies) if (e.boss) boss = e;
    if (boss) {
      const dx = p.x - boss.x;
      const dy = p.y - boss.y;
      const d = Math.hypot(dx, dy) || 1;
      const want = 115;
      const radial = d < want ? 0.85 : d > want + 60 ? -0.7 : 0; // + = away
      const mx = -dy / d + (dx / d) * radial;
      const my = dx / d + (dy / d) * radial;
      const l = Math.hypot(mx, my) || 1;
      return { x: mx / l, y: my / l };
    }
  }
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
  // M3 loop invariants: survive to the deadline, level up, build a loadout.
  const surv = drive({
    seed: 1234,
    runLength: 300,
    characterId: "knight",
    seconds: 300,
  });
  ok(surv.maxEnemies > 30, "expected a swarm (got " + surv.maxEnemies + ")");
  ok(surv.maxEnemies <= 320, "enemy count unbounded (" + surv.maxEnemies + ")");
  ok(surv.maxProj < 2500, "projectiles leaking (" + surv.maxProj + ")");
  ok(surv.maxGems > 0, "no gems dropped");
  ok(surv.s.player.kills > 20, "no real combat happened");
  ok(
    surv.s.player.level >= 5,
    "player should level up (got " + surv.s.player.level + ")",
  );
  ok(
    !surv.s.outcome && surv.s.time >= 300 - STEP,
    "Knight should reach the deadline alive (t=" +
      surv.s.time.toFixed(0) +
      " " +
      surv.s.outcome +
      ")",
  );

  // M4: the boss spawns at the deadline and clears the normal field.
  const boss = drive({
    seed: 1234,
    runLength: 300,
    characterId: "knight",
    seconds: 301,
  });
  ok(boss.s.spawn.bossSpawned, "boss should spawn at the deadline");
  ok(
    boss.s.enemies.length === 1 && boss.s.enemies[0].boss,
    "boss should be the only enemy",
  );

  // M4: a reliable build reaches VICTORY at 5-min and 15-min, banking the boss reward.
  const v5 = drive({
    seed: 1234,
    runLength: 300,
    characterId: "mage",
    seconds: 520,
  });
  ok(
    v5.s.outcome === "victory",
    "mage should win the 5-min boss (got " + v5.s.outcome + ")",
  );
  ok(v5.s.player.coins >= 60, "boss coin reward should bank");

  const v15 = drive({
    seed: 1234,
    runLength: 900,
    characterId: "mage",
    seconds: 1160,
  });
  ok(
    v15.s.outcome === "victory",
    "mage should win the 15-min boss (got " + v15.s.outcome + ")",
  );

  console.log(
    `SimProbe OK (M4): knight reached ${surv.s.time.toFixed(0)}s lvl=${surv.s.player.level} | ` +
      `mage 5min=VICTORY@${v5.s.time.toFixed(0)}s coins=${v5.s.player.coins} | ` +
      `mage 15min=VICTORY@${v15.s.time.toFixed(0)}s`,
  );
}

// Only run the gate when executed directly (importable for the tuning harness).
if (import.meta.url === `file://${process.argv[1]}`) main();
