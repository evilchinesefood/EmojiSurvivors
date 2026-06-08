// View-layer particle system — spawned from drained sim events (DOM-free sim stays
// clean). Hit sparks, death puffs, level-up rings, floating damage text. Capped so a
// 1000-enemy screen can't flood it. Drawn in world space (shares the shake transform).
const MAX = 700;
const EMOJI_FONT =
  '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';

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
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
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
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 20,
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
        vx: Math.cos(a) * 180,
        vy: Math.sin(a) * 180,
        life: 0.45,
        maxLife: 0.45,
        size: 3,
        color,
        drag: 0.85,
      });
    }
  }

  function text(x, y, str, color) {
    add({
      x: x + (Math.random() * 10 - 5),
      y,
      vx: 0,
      vy: -42,
      life: 0.65,
      maxLife: 0.65,
      size: 13,
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
      if (p.drag < 1) {
        p.vx *= p.drag;
        p.vy *= p.drag;
      }
    }
  }

  function draw(ctx, cam) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (!cam.inView(p.x, p.y, 30)) continue;
      const a = Math.max(0, p.life / p.maxLife);
      const sx = cam.toScreenX(p.x);
      const sy = cam.toScreenY(p.y);
      if (p.text) {
        ctx.globalAlpha = a;
        ctx.font = "700 " + p.size + "px " + EMOJI_FONT;
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, sx, sy);
      } else {
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(sx, sy, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  return {
    spark,
    puff,
    ring,
    text,
    update,
    draw,
    get count() {
      return ps.length;
    },
  };
}
