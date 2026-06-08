// Player + enemy movement. Player: normalized intent × speed. Enemies: seek the
// player with soft separation (boids-lite via the spatial hash) so swarms surround
// without stacking on one pixel. (Enemy steering is added in M2.)
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
}
