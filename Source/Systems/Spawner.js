// Time-driven spawning. Reads the difficulty curve for interval/cap/elite knobs,
// weights unlocked tiers, rings the player with periodic swarm waves, and drops a
// fat elite on its own timer. The boss spawns at the run deadline. Enemies are
// pooled. Spawns happen on a ring just outside a typical viewport.
import { difficulty } from "../Content/Curve.js";
import { ENEMIES, NORMAL_TIERS, ELITE_IDS } from "../Content/Enemies.js";
import { bossFor } from "../Content/Bosses.js";
import { emit } from "../Engine/State.js";

const SPAWN_R = 660;

export function spawnBoss(state) {
  for (const e of state.enemies) state.pool.enemy.release(e);
  state.enemies.length = 0;
  const def = bossFor(state.runLength);
  const m = state.modifiers;
  const hp = def.hp * (m ? m.bossHpMul : 1);
  const p = state.player;
  const a = state.spawnRng.angle();
  const e = state.pool.enemy.acquire();
  e.uid = ++state.entitySeq;
  e.kind = def.id;
  e.name = def.name;
  e.emoji = def.emoji;
  e.size = def.size;
  e.elite = false;
  e.dropsChest = false;
  e.boss = true;
  e.bossId = def.id;
  e.maxHp = hp;
  e.hp = hp;
  e.speed = def.speed;
  e.dmg = def.dmg;
  e.xp = 0;
  e.coinChance = 0;
  e.coinReward = def.coinReward;
  e.x = p.x + Math.cos(a) * 520;
  e.y = p.y + Math.sin(a) * 520;
  e.vx = 0;
  e.vy = 0;
  e.flash = 0;
  e.knockX = 0;
  e.knockY = 0;
  e.dead = false;
  for (const k in e.hitTimers) delete e.hitTimers[k]; // reuse the pooled object
  state.enemies.push(e);
  state.spawn.bossSpawned = true;
  state.spawn.bossAlive = true;
  emit(state, "boss");
}

export function spawnEnemy(state, def, x, y, d) {
  const m = state.modifiers;
  const esc = state.spawn.esc || 1; // endless escalation (1 normally)
  const e = state.pool.enemy.acquire();
  e.uid = ++state.entitySeq;
  e.kind = def.id;
  e.emoji = def.emoji;
  e.size = def.size * (m ? m.enemySizeMul : 1);
  e.elite = !!def.elite;
  e.dropsChest = !!def.dropsChest;
  e.boss = false;
  e.bossId = null;
  e.maxHp = def.hp * d.hpScale * esc * (m ? m.enemyHpMul : 1);
  e.hp = e.maxHp;
  e.speed =
    def.speed *
    (def.elite ? 0.9 : 1) *
    d.speedScale *
    (m ? m.enemySpeedMul : 1);
  e.dmg = def.dmg * d.dmgScale * (m ? m.enemyDmgMul : 1);
  e.xp = def.xp;
  e.coinChance = def.coinChance;
  e.x = x;
  e.y = y;
  e.vx = 0;
  e.vy = 0;
  e.flash = 0;
  e.knockX = 0;
  e.knockY = 0;
  e.dead = false;
  for (const k in e.hitTimers) delete e.hitTimers[k]; // reuse the pooled object
  state.enemies.push(e);
  return e;
}

function ringPoint(state, px, py, r) {
  const a = state.spawnRng.angle();
  const rr = r + state.spawnRng.float(0, 80);
  return { x: px + Math.cos(a) * rr, y: py + Math.sin(a) * rr };
}

function pickTier(state, t) {
  let total = 0;
  const avail = [];
  for (const id of NORMAL_TIERS) {
    const def = ENEMIES[id];
    if (t >= def.unlockAt) {
      avail.push(def);
      total += def.weight;
    }
  }
  let r = state.spawnRng.float(0, total);
  for (const def of avail) {
    r -= def.weight;
    if (r <= 0) return def;
  }
  return avail[avail.length - 1];
}

function spawnWave(state, t, d) {
  const p = state.player;
  // Waves deliberately burst the steady trickle cap for a denser swarm (balance is
  // tuned around this; the headless probe bounds peak count at 320).
  const n = Math.min(8 + Math.floor(t / 45), 28);
  const base = state.spawnRng.angle();
  const def = ENEMIES[t < 25 ? "wisp" : "bat"];
  const r = SPAWN_R + 50;
  for (let i = 0; i < n; i++) {
    const a = base + (i / n) * Math.PI * 2;
    spawnEnemy(state, def, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, d);
  }
}

export function stepSpawner(state, dt) {
  if (state.spawn.bossSpawned) return; // boss phase clears normal spawns
  const m = state.modifiers;
  // Endless never ends — it just keeps escalating; everyone else meets the boss.
  if (!state.endless && state.time >= state.runLength) {
    spawnBoss(state);
    return;
  }
  const t = state.time;
  const d = difficulty(t);
  const sp = state.spawn;
  const p = state.player;
  const spawnMul = m ? m.spawnMul : 1;
  const bossRush = m ? m.bossRush : false;
  // Endless: ramp HP/density past the deadline (every 240s ≈ +100% enemy HP).
  sp.esc = state.endless ? 1 + Math.max(0, t - state.runLength) / 240 : 1;
  const cap = Math.round(d.cap * spawnMul);

  sp.timer -= dt;
  let guard = 0;
  while (sp.timer <= 0) {
    if (state.enemies.length < cap) {
      const def = pickTier(state, t);
      const pt = ringPoint(state, p.x, p.y, SPAWN_R);
      spawnEnemy(state, def, pt.x, pt.y, d);
    }
    sp.timer += d.spawnInterval / spawnMul;
    if (++guard > 80) break;
  }

  sp.waveTimer -= dt;
  if (sp.waveTimer <= 0) {
    sp.waveTimer += d.waveInterval;
    spawnWave(state, t, d);
  }

  for (const id of ELITE_IDS) {
    if (!bossRush && t < ENEMIES[id].unlockAt) continue;
    sp.eliteTimers[id] -= dt;
    if (sp.eliteTimers[id] <= 0) {
      sp.eliteTimers[id] += bossRush ? 9 : 26;
      const pt = ringPoint(state, p.x, p.y, SPAWN_R);
      spawnEnemy(state, ENEMIES[id], pt.x, pt.y, d);
    }
  }
}
