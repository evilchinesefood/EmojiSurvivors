// Time-driven spawning. Reads the difficulty curve for interval/cap/elite knobs,
// weights unlocked tiers, rings the player with periodic swarm waves, and drops a
// fat elite on its own timer. Boss-at-deadline is layered on in M4. Enemies are
// pooled. Spawns happen on a ring just outside a typical viewport.
import { difficulty } from "../Content/Curve.js";
import { ENEMIES, NORMAL_TIERS, ELITE_ID } from "../Content/Enemies.js";
import { bossFor } from "../Content/Bosses.js";
import { emit } from "../Engine/State.js";

const SPAWN_R = 660;

export function spawnBoss(state) {
  for (const e of state.enemies) state.pool.enemy.release(e);
  state.enemies.length = 0;
  const def = bossFor(state.runLength);
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
  e.maxHp = def.hp;
  e.hp = def.hp;
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
  e.hitTimers = {};
  state.enemies.push(e);
  state.spawn.bossSpawned = true;
  state.spawn.bossAlive = true;
  emit(state, "boss");
}

export function spawnEnemy(state, def, x, y, d) {
  const e = state.pool.enemy.acquire();
  e.uid = ++state.entitySeq;
  e.kind = def.id;
  e.emoji = def.emoji;
  e.size = def.size;
  e.elite = !!def.elite;
  e.dropsChest = !!def.dropsChest;
  e.boss = false;
  e.bossId = null;
  e.maxHp = def.hp * d.hpScale;
  e.hp = e.maxHp;
  e.speed = def.speed * (def.elite ? 0.9 : 1) * d.speedScale;
  e.dmg = def.dmg * d.dmgScale;
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
  e.hitTimers = {};
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
  if (state.time >= state.runLength) {
    spawnBoss(state);
    return;
  }
  const t = state.time;
  const d = difficulty(t);
  const sp = state.spawn;
  const p = state.player;

  sp.timer -= dt;
  let guard = 0;
  while (sp.timer <= 0) {
    if (state.enemies.length < d.cap) {
      const def = pickTier(state, t);
      const pt = ringPoint(state, p.x, p.y, SPAWN_R);
      spawnEnemy(state, def, pt.x, pt.y, d);
    }
    sp.timer += d.spawnInterval;
    if (++guard > 40) break;
  }

  sp.waveTimer -= dt;
  if (sp.waveTimer <= 0) {
    sp.waveTimer += d.waveInterval;
    spawnWave(state, t, d);
  }

  if (t >= ENEMIES[ELITE_ID].unlockAt) {
    sp.eliteTimer -= dt;
    if (sp.eliteTimer <= 0) {
      sp.eliteTimer += 26;
      const pt = ringPoint(state, p.x, p.y, SPAWN_R);
      spawnEnemy(state, ENEMIES[ELITE_ID], pt.x, pt.y, d);
    }
  }
}
