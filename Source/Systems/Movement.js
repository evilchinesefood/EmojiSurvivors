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
