// Canvas draw layer. Reads sim state + camera, draws the scrolling grid then every
// entity as an emoji via fillText, viewport-culled. Purely a view of frozen state —
// it never mutates the sim. Particles/FX overlay on top (drawn by Main).
const EMOJI_FONT =
  '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
const G = 64;

export function makeRenderer(ctx) {
  function emoji(ch, sx, sy, size) {
    ctx.font = size + "px " + EMOJI_FONT;
    ctx.fillText(ch, sx, sy);
  }

  function grid(cam) {
    const w = cam.w;
    const h = cam.h;
    ctx.fillStyle = "#0e0b14";
    ctx.fillRect(0, 0, w, h);
    const leftW = cam.x - w / 2;
    const topW = cam.y - h / 2;
    const startX = Math.ceil(leftW / G) * G - leftW;
    const startY = Math.ceil(topW / G) * G - topW;
    ctx.strokeStyle = "rgba(120,90,160,0.10)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = startX; x < w; x += G) {
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, h);
    }
    for (let y = startY; y < h; y += G) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(w, y + 0.5);
    }
    ctx.stroke();
  }

  function entities(state, cam) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (const g of state.gems) {
      if (!cam.inView(g.x, g.y, 24)) continue;
      emoji(g.emoji, cam.toScreenX(g.x), cam.toScreenY(g.y), g.size || 14);
    }
    for (const c of state.coins) {
      if (!cam.inView(c.x, c.y, 24)) continue;
      emoji(c.emoji, cam.toScreenX(c.x), cam.toScreenY(c.y), c.size || 16);
    }
    for (const d of state.drops) {
      if (!cam.inView(d.x, d.y, 24)) continue;
      emoji(d.emoji, cam.toScreenX(d.x), cam.toScreenY(d.y), d.size || 20);
    }

    // Aura / explosion zones (render-only) under the actors.
    for (const z of state.hazards) {
      if (!cam.inView(z.x, z.y, z.r + 20)) continue;
      const a = z.life != null ? Math.max(0, z.life / (z.maxLife || 1)) : 1;
      ctx.beginPath();
      ctx.arc(cam.toScreenX(z.x), cam.toScreenY(z.y), z.r, 0, Math.PI * 2);
      ctx.fillStyle = (z.color || "rgba(155,108,255,") + 0.16 * a + ")";
      ctx.fill();
      ctx.strokeStyle = (z.color || "rgba(155,108,255,") + 0.5 * a + ")";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    for (const e of state.enemies) {
      if (!cam.inView(e.x, e.y, e.size + 12)) continue;
      const sx = cam.toScreenX(e.x);
      const sy = cam.toScreenY(e.y);
      if (e.flash > 0) {
        ctx.beginPath();
        ctx.arc(sx, sy, e.size * 0.62, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.fill();
      }
      emoji(e.emoji, sx, sy, e.size);
    }

    for (const o of state.orbits) {
      if (!cam.inView(o.x, o.y, 24)) continue;
      emoji(o.emoji, cam.toScreenX(o.x), cam.toScreenY(o.y), o.size || 22);
    }
    for (const p of state.projectiles) {
      if (!cam.inView(p.x, p.y, 24)) continue;
      emoji(p.emoji, cam.toScreenX(p.x), cam.toScreenY(p.y), p.size || 20);
    }

    // Player (centered). Blink during i-frames.
    const pl = state.player;
    const blink = pl.invuln > 0 && Math.floor(state.time * 16) % 2 === 0;
    if (!blink) {
      const sx = cam.toScreenX(pl.x);
      const sy = cam.toScreenY(pl.y);
      if (pl.hitFlash > 0) {
        ctx.beginPath();
        ctx.arc(sx, sy, 22, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(192,53,74,0.45)";
        ctx.fill();
      }
      emoji(state.character.emoji, sx, sy, 30);
    }
  }

  return {
    background(cam) {
      grid(cam);
    },
    render(state, cam) {
      grid(cam);
      entities(state, cam);
    },
  };
}
