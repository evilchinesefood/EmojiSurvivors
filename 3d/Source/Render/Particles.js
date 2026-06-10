// View-layer particle data — spawned from drained sim events (DOM-free sim stays
// clean). Positions live on the sim plane (x, y) with a height (z); the 3D renderer
// draws dots as a point cloud and text as billboards. Capped so a 1000-enemy screen
// can't flood it.
const MAX = 700;

export function makeParticles() {
  const ps = [];

  function add(p) {
    if (ps.length >= MAX) {
      ps[0] = ps[ps.length - 1]; // O(1) drop-oldest (unordered draw, order irrelevant)
      ps.pop();
    }
    ps.push(p);
  }

  function spark(x, y, color, n = 5, spd = 120) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = spd * (0.4 + Math.random() * 0.8);
      add({
        x,
        y,
        z: 30,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        vz: 20 + Math.random() * 50,
        life: 0.3,
        maxLife: 0.3,
        size: 2 + Math.random() * 2,
        color,
        drag: 0.86,
      });
    }
  }

  function puff(x, y, color, n = 7, size = 4) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 60 * (0.3 + Math.random());
      add({
        x,
        y,
        z: 22,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        vz: 30 + Math.random() * 30,
        life: 0.5,
        maxLife: 0.5,
        size: size * (0.6 + Math.random() * 0.8),
        color,
        drag: 0.9,
      });
    }
  }

  function ring(x, y, color) {
    const n = 14;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      add({
        x,
        y,
        z: 14,
        vx: Math.cos(a) * 180,
        vy: Math.sin(a) * 180,
        vz: 16,
        life: 0.45,
        maxLife: 0.45,
        size: 3,
        color,
        drag: 0.85,
      });
    }
  }

  function text(x, y, str, color, size = 13) {
    const big = size > 18;
    add({
      x: x + (Math.random() * 14 - 7),
      y: y + (Math.random() * 14 - 7),
      z: 48,
      vx: 0,
      vy: 0,
      vz: big ? 58 : 42,
      life: big ? 0.8 : 0.65,
      maxLife: big ? 0.8 : 0.65,
      size,
      color,
      text: str,
      drag: 1,
    });
  }

  function update(dt) {
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) {
        ps[i] = ps[ps.length - 1];
        ps.pop();
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.drag < 1) {
        p.vx *= p.drag;
        p.vy *= p.drag;
        p.vz *= p.drag;
      }
    }
  }

  return {
    spark,
    puff,
    ring,
    text,
    update,
    list: ps,
    get count() {
      return ps.length;
    },
  };
}
