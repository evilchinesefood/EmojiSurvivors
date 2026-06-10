// Canvas draw layer. Reads sim state + camera, draws the scrolling grid then every
// entity as an emoji via fillText, viewport-culled. Purely a view of frozen state —
// it never mutates the sim. Particles/FX overlay on top (drawn by Main).
const EMOJI_FONT =
  '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
const G = 64;

export function makeRenderer(ctx) {
  // Memoize the font shorthand per size (a small finite set) + skip redundant `ctx.font`
  // writes — setting/parsing the font is one of the costliest 2D-context ops per frame.
  const fontCache = new Map();
  let lastFont = "";
  function fontFor(size) {
    let f = fontCache.get(size);
    if (f === undefined) {
      f = size + "px " + EMOJI_FONT;
      fontCache.set(size, f);
    }
    return f;
  }
  function emoji(ch, sx, sy, size, alpha = 1) {
    const f = fontFor(size);
    if (f !== lastFont) {
      ctx.font = f;
      lastFont = f;
    }
    // Color emoji honor the fill's ALPHA: the hazard pass (every weapon fire) leaves
    // fillStyle at a low-alpha color, which made actors drawn after it render ~10%
    // opaque — a per-attack flash. Default to full opacity; callers fading out
    // (e.g. the #666 horns) pass an explicit alpha.
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#fff";
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

  // ── Background ambiance (all dim + behind entities so they never compete with
  // the gameplay emoji). Decals are deterministic per world-cell (stable + infinite);
  // fog drifts in screen space; the vignette darkens the ground (not the actors).

  // Cheap integer hash → a stable pseudo-random uint32 per cell.
  function hash32(x, y) {
    let h = (x | 0) * 374761393 + (y | 0) * 668265263;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (h ^ (h >>> 16)) >>> 0;
  }

  const STONE = "rgba(150,143,172,0.16)";
  const STONE_DK = "rgba(116,108,138,0.18)";
  const BONE = "rgba(202,198,182,0.15)";
  const WEB = "rgba(186,186,206,0.10)";
  const GRASS = "rgba(96,112,84,0.18)";

  const PROPS = [
    function tombstone(sx, sy, s) {
      const w = 13 * s;
      const hh = 20 * s;
      ctx.fillStyle = STONE;
      ctx.beginPath();
      ctx.moveTo(sx - w / 2, sy + hh / 2);
      ctx.lineTo(sx - w / 2, sy - hh / 2 + w / 2);
      ctx.arc(sx, sy - hh / 2 + w / 2, w / 2, Math.PI, 0);
      ctx.lineTo(sx + w / 2, sy + hh / 2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = STONE_DK;
      ctx.lineWidth = 1.4 * s;
      ctx.beginPath();
      ctx.moveTo(sx, sy - hh / 5);
      ctx.lineTo(sx, sy + hh / 6);
      ctx.moveTo(sx - w / 4, sy - hh / 9);
      ctx.lineTo(sx + w / 4, sy - hh / 9);
      ctx.stroke();
    },
    function cross(sx, sy, s) {
      const hh = 22 * s;
      const w = 12 * s;
      ctx.strokeStyle = STONE;
      ctx.lineWidth = 3 * s;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(sx, sy - hh / 2);
      ctx.lineTo(sx, sy + hh / 2);
      ctx.moveTo(sx - w / 2, sy - hh / 6);
      ctx.lineTo(sx + w / 2, sy - hh / 6);
      ctx.stroke();
    },
    function bone(sx, sy, s, hsh) {
      const l = 11 * s;
      const a = (((hsh >>> 9) % 16) / 16) * Math.PI;
      const dx = Math.cos(a) * l;
      const dy = Math.sin(a) * l;
      ctx.strokeStyle = BONE;
      ctx.lineWidth = 3 * s;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(sx - dx, sy - dy);
      ctx.lineTo(sx + dx, sy + dy);
      ctx.stroke();
      ctx.fillStyle = BONE;
      ctx.beginPath();
      ctx.arc(sx - dx, sy - dy, 2.4 * s, 0, 7);
      ctx.arc(sx + dx, sy + dy, 2.4 * s, 0, 7);
      ctx.fill();
    },
    function web(sx, sy, s) {
      const R = 17 * s;
      ctx.strokeStyle = WEB;
      ctx.lineWidth = 1 * s;
      for (let k = 0; k <= 3; k++) {
        const a = (k / 3) * (Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + Math.cos(a) * R, sy + Math.sin(a) * R);
        ctx.stroke();
      }
      for (let r = 6 * s; r <= R; r += 6 * s) {
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI / 2);
        ctx.stroke();
      }
    },
    function grass(sx, sy, s) {
      ctx.strokeStyle = GRASS;
      ctx.lineWidth = 1.5 * s;
      ctx.lineCap = "round";
      for (let k = -2; k <= 2; k++) {
        ctx.beginPath();
        ctx.moveTo(sx + k * 3 * s, sy + 6 * s);
        ctx.lineTo(sx + k * 4 * s, sy - 8 * s);
        ctx.stroke();
      }
    },
    function rock(sx, sy, s) {
      ctx.fillStyle = "rgba(72,68,90,0.22)";
      ctx.beginPath();
      ctx.ellipse(sx, sy, 12 * s, 8 * s, 0, 0, 7);
      ctx.fill();
    },
  ];

  const DECAL_CELL = 200;
  function decals(cam) {
    const left = cam.x - cam.w / 2;
    const top = cam.y - cam.h / 2;
    const cx0 = Math.floor(left / DECAL_CELL) - 1;
    const cx1 = Math.floor((left + cam.w) / DECAL_CELL) + 1;
    const cy0 = Math.floor(top / DECAL_CELL) - 1;
    const cy1 = Math.floor((top + cam.h) / DECAL_CELL) + 1;
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const hsh = hash32(cx, cy);
        if (hsh % 100 >= 50) continue; // ~50% of cells get a prop
        const wx = cx * DECAL_CELL + (((hsh >>> 12) & 255) / 255) * DECAL_CELL;
        const wy = cy * DECAL_CELL + (((hsh >>> 20) & 255) / 255) * DECAL_CELL;
        if (!cam.inView(wx, wy, 40)) continue;
        const s = 0.8 + ((hsh >>> 4) & 7) / 10;
        PROPS[(hsh >>> 7) % PROPS.length](
          cam.toScreenX(wx),
          cam.toScreenY(wy),
          s,
          hsh,
        );
      }
    }
  }

  const FOG = [
    { sx: 0.05, sy: 0.04, px: 0.0, py: 1.3, r: 360, a: 0.07 },
    { sx: 0.03, sy: 0.055, px: 2.1, py: 0.4, r: 300, a: 0.06 },
    { sx: 0.06, sy: 0.035, px: 4.0, py: 3.1, r: 430, a: 0.05 },
    { sx: 0.045, sy: 0.06, px: 1.0, py: 5.0, r: 260, a: 0.06 },
    { sx: 0.035, sy: 0.045, px: 5.5, py: 2.2, r: 340, a: 0.05 },
  ];
  function fog(cam) {
    const t = performance.now() / 1000;
    for (let i = 0; i < FOG.length; i++) {
      const f = FOG[i];
      const cx =
        (0.5 + 0.42 * Math.sin(t * f.sx + f.px)) * cam.w - cam.x * 0.04;
      const cy =
        (0.5 + 0.42 * Math.cos(t * f.sy + f.py)) * cam.h - cam.y * 0.04;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, f.r);
      g.addColorStop(0, "rgba(150,130,182," + f.a + ")");
      g.addColorStop(1, "rgba(150,130,182,0)");
      ctx.fillStyle = g;
      ctx.fillRect(cx - f.r, cy - f.r, f.r * 2, f.r * 2);
    }
  }

  // The vignette depends only on the viewport size — build it once per resize, not
  // every frame (createRadialGradient + addColorStop allocate each call).
  let vigGrad = null;
  let vigW = 0;
  let vigH = 0;
  function vignette(cam) {
    const w = cam.w;
    const h = cam.h;
    if (!vigGrad || vigW !== w || vigH !== h) {
      vigGrad = ctx.createRadialGradient(
        w / 2,
        h / 2,
        Math.min(w, h) * 0.46,
        w / 2,
        h / 2,
        Math.max(w, h) * 0.74,
      );
      vigGrad.addColorStop(0, "rgba(8,5,16,0)");
      vigGrad.addColorStop(1, "rgba(8,5,16,0.5)");
      vigW = w;
      vigH = h;
    }
    ctx.fillStyle = vigGrad;
    ctx.fillRect(0, 0, w, h);
  }

  function backdrop(cam) {
    grid(cam);
    fog(cam);
    decals(cam);
    vignette(cam);
  }

  function entities(state, cam) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    lastFont = ""; // other layers (particles/fx) change ctx.font between frames

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

    // Steady aura glows (continuous weapons) — soft radial gradient that gently
    // breathes around the player. Never strobes (the old per-pulse rings did).
    if (state.auraViz && state.auraViz.length) {
      const px = cam.toScreenX(state.player.x);
      const py = cam.toScreenY(state.player.y);
      const breathe = 0.94 + 0.06 * Math.sin(state.time * 2);
      for (const av of state.auraViz) {
        const r = av.r * breathe;
        const g = ctx.createRadialGradient(px, py, r * 0.2, px, py, r);
        g.addColorStop(0, av.color + "0.28)");
        g.addColorStop(0.6, av.color + "0.18)");
        g.addColorStop(0.9, av.color + "0.26)"); // soft brighter rim = readable zone edge
        g.addColorStop(1, av.color + "0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // One-shot burst visuals (explosion / whip) — soft blooms with a smooth ease-out
    // fade, no hard bright ring (the stroke was the harsh, strobing part).
    for (const z of state.hazards) {
      if (!cam.inView(z.x, z.y, z.r + 20)) continue;
      const a = z.life != null ? Math.max(0, z.life / (z.maxLife || 1)) : 1;
      const ease = a * a;
      const sx = cam.toScreenX(z.x);
      const sy = cam.toScreenY(z.y);
      const col = z.color || "rgba(155,108,255,";
      const g = ctx.createRadialGradient(sx, sy, z.r * 0.12, sx, sy, z.r);
      g.addColorStop(0, col + 0.36 * ease + ")");
      g.addColorStop(0.55, col + 0.2 * ease + ")");
      g.addColorStop(1, col + "0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(sx, sy, z.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // No per-hit enemy flash: a swarm-wide AoE pulse made every emoji bump at once,
    // which read as a full-screen flash. Hit feedback comes from damage numbers,
    // knockback, and death puffs instead.
    for (const e of state.enemies) {
      if (!cam.inView(e.x, e.y, e.size + 12)) continue;
      emoji(e.emoji, cam.toScreenX(e.x), cam.toScreenY(e.y), e.size);
    }

    for (const o of state.orbits) {
      if (!cam.inView(o.x, o.y, 24)) continue;
      emoji(o.emoji, cam.toScreenX(o.x), cam.toScreenY(o.y), o.size || 22);
    }
    for (const p of state.projectiles) {
      if (!cam.inView(p.x, p.y, 24)) continue;
      emoji(p.emoji, cam.toScreenX(p.x), cam.toScreenY(p.y), p.size || 20);
    }

    // The Auditor (tainted saves) watches from just behind.
    if (state.auditor && cam.inView(state.auditor.x, state.auditor.y, 30))
      emoji(
        "🕵️",
        cam.toScreenX(state.auditor.x),
        cam.toScreenY(state.auditor.y),
        26,
      );
    // The Graveyard Cat (lucky seeds).
    if (state.cat && cam.inView(state.cat.x, state.cat.y, 24))
      emoji("🐈‍⬛", cam.toScreenX(state.cat.x), cam.toScreenY(state.cat.y), 20);

    // Player (centered). Blink during i-frames. Clown Mode replaces the sprite.
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
      emoji(state.tainted ? "🤡" : state.character.emoji, sx, sy, 30);
      if (state.devil > 0) {
        // kill #666 horns: solid, then fade over the final second
        emoji("😈", sx, sy - 24, 13, Math.min(1, state.devil));
        ctx.globalAlpha = 1;
      }
    }
  }

  return {
    background(cam) {
      backdrop(cam);
    },
    render(state, cam, shake) {
      backdrop(cam);
      if (shake && (shake.x || shake.y)) {
        ctx.save();
        ctx.translate(shake.x, shake.y);
        entities(state, cam);
        ctx.restore();
      } else {
        entities(state, cam);
      }
    },
  };
}
