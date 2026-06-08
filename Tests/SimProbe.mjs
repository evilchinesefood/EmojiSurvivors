// Seeded headless full-run probe. Steps the DOM-free sim at a fixed seed and asserts
// invariants (no NaN/Infinity, bounded entity counts, combat happens). Boss + victory
// assertions are layered on at M4. Reproducible via the fixed seed.
import { createRunState } from "../Source/Engine/State.js";
import { stepSim, STEP } from "../Source/Engine/GameLoop.js";
import { CHARACTERS } from "../Source/Content/Characters.js";

function fail(msg) {
  console.error("SimProbe FAIL: " + msg);
  process.exit(1);
}
function ok(c, msg) {
  if (!c) fail(msg);
}
const finite = (...xs) => xs.every(Number.isFinite);

// Headless driver. `pick` resolves pending level-ups (added when Leveling exists).
export function drive({ seed, runLength, characterId, seconds, pick }) {
  const s = createRunState({
    seed,
    runLength,
    character: CHARACTERS[characterId],
    powerGrid: {},
  });
  const steps = Math.round(seconds / STEP);
  let maxEnemies = 0;
  let maxProj = 0;
  let maxGems = 0;
  for (let i = 0; i < steps; i++) {
    const t = i * STEP;
    const ang = t * 0.8;
    s.input.move = { x: Math.cos(ang), y: Math.sin(ang) };
    stepSim(s, STEP);
    let guard = 0;
    while (s.awaitingLevelUp && pick) {
      pick(s);
      if (++guard > 100) fail("level-up resolver stuck at t=" + t.toFixed(1));
    }
    s.events.length = 0;
    maxEnemies = Math.max(maxEnemies, s.enemies.length);
    maxProj = Math.max(maxProj, s.projectiles.length);
    maxGems = Math.max(maxGems, s.gems.length);
    if (!finite(s.player.x, s.player.y, s.player.hp, s.player.xp))
      fail("player NaN at t=" + t.toFixed(2));
    for (let k = 0; k < s.enemies.length; k++) {
      const e = s.enemies[k];
      if (!finite(e.x, e.y, e.hp)) fail("enemy NaN at t=" + t.toFixed(2));
    }
    if (s.outcome) return { s, maxEnemies, maxProj, maxGems, endedAt: t };
  }
  return { s, maxEnemies, maxProj, maxGems, endedAt: seconds };
}

function main() {
  // M2: combat core is alive and stable over a short run (no leveling yet).
  const r = drive({
    seed: 1234,
    runLength: 300,
    characterId: "knight",
    seconds: 60,
  });
  ok(
    r.maxEnemies > 20,
    "expected a swarm to build up (got " + r.maxEnemies + ")",
  );
  ok(r.maxEnemies <= 460, "enemy count unbounded (" + r.maxEnemies + ")");
  ok(r.maxProj < 1500, "projectiles leaking (" + r.maxProj + ")");
  ok(r.s.player.kills > 0, "no kills happened");
  ok(r.maxGems > 0, "no gems dropped");
  console.log(
    `SimProbe OK (M2): kills=${r.s.player.kills} maxEnemies=${r.maxEnemies} ` +
      `maxProj=${r.maxProj} endedAt=${r.endedAt.toFixed(1)}s outcome=${r.s.outcome}`,
  );
}

main();
