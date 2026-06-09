// Player + enemy movement. Player: normalized intent × speed. Enemies: seek the
// player with soft separation (boids-lite via the spatial hash) so swarms surround
// without stacking on one pixel.
import { emit } from "../Engine/State.js";

export function movePlayer(state, dt) {
  const p = state.player;
  const m = state.input.move;
  const len = Math.hypot(m.x, m.y);
  if (len > 0.001) {
    const nx = m.x / len;
    const ny = m.y / len;
    p.vx = nx * state.stats.speed;
    p.vy = ny * state.stats.speed;
    p.facing.x = nx;
    p.facing.y = ny;
  } else {
    p.vx = 0;
    p.vy = 0;
  }
  p.x += p.vx * dt;
  p.y += p.vy * dt;
}

// Enemies seek the player with soft separation (boids-lite via the spatial hash)
// so swarms surround without stacking. Assumes state.hash holds current enemies.
export function stepEnemies(state, dt) {
  const p = state.player;
  const enemies = state.enemies;
  const near = state.neighbors;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    let ax = p.x - e.x;
    let ay = p.y - e.y;
    const d = Math.hypot(ax, ay) || 1;
    ax /= d;
    ay /= d;
    if (e.flees) {
      ax = -ax;
      ay = -ay;
    }

    state.hash.queryCircle(e.x, e.y, e.size, near);
    let sx = 0;
    let sy = 0;
    for (let j = 0; j < near.length; j++) {
      const o = near[j];
      if (o === e) continue;
      const ox = e.x - o.x;
      const oy = e.y - o.y;
      const od = ox * ox + oy * oy;
      const rr = (e.size + o.size) * 0.5;
      if (od > 0.0001 && od < rr * rr) {
        const inv = 1 / Math.sqrt(od);
        sx += ox * inv;
        sy += oy * inv;
      }
    }
    ax += sx * 0.9;
    ay += sy * 0.9;
    const al = Math.hypot(ax, ay) || 1;
    e.vx = (ax / al) * e.speed;
    e.vy = (ay / al) * e.speed;
    e.x += e.vx * dt;
    e.y += e.vy * dt;

    if (e.knockX) {
      e.x += e.knockX * dt;
      e.knockX *= 0.8;
      if (Math.abs(e.knockX) < 3) e.knockX = 0;
    }
    if (e.knockY) {
      e.y += e.knockY * dt;
      e.knockY *= 0.8;
      if (Math.abs(e.knockY) < 3) e.knockY = 0;
    }
    if (e.flash > 0) e.flash -= dt;
    const ht = e.hitTimers;
    for (const k in ht) {
      ht[k] -= dt;
      if (ht[k] <= 0) delete ht[k];
    }
  }

  // The Auditor (tainted saves): untouchable, deals nothing, lurks ~80px off and
  // occasionally has opinions. Reads only player position — no RNG, no balance.
  const a = state.auditor;
  if (a) {
    const dx = p.x - a.x;
    const dy = p.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    // Slightly faster than the player + a hard catch-up term: you cannot lose it.
    const sp = d > 90 ? Math.max(state.stats.speed * 1.05, (d - 80) * 1.5) : 0;
    a.x += (dx / d) * sp * dt;
    a.y += (dy / d) * sp * dt;
    a.whisperT -= dt;
    if (a.whisperT <= 0) {
      a.whisperT = 45;
      emit(state, "whisper", { x: a.x, y: a.y - 24 });
    }
  }

  // The Graveyard Cat (1-in-40 seeds): cosmetic companion, same follow scheme.
  const c = state.cat;
  if (c) {
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    const d = Math.hypot(dx, dy) || 1;
    const sp = d > 56 ? Math.max(state.stats.speed * 1.02, (d - 48) * 1.4) : 0;
    c.x += (dx / d) * sp * dt;
    c.y += (dy / d) * sp * dt;
  }
}
