// Screen shake + hurt vignette (view-layer juice). Trauma decays each frame; the
// shake offset is trauma² × random so small hits barely nudge and big ones jolt. The
// hurt flash is a brief red vignette. Both no-op when their setting is off.
export function makeFx() {
  let trauma = 0;
  let flash = 0;

  return {
    shake(amount) {
      trauma = Math.min(1, trauma + amount);
    },
    hurt(withShake = true) {
      flash = 1;
      if (withShake) this.shake(0.5);
    },
    update(dt) {
      if (trauma > 0) trauma = Math.max(0, trauma - dt * 1.6);
      if (flash > 0) flash = Math.max(0, flash - dt * 3);
    },
    offset() {
      if (trauma <= 0) return { x: 0, y: 0 };
      const m = trauma * trauma * 16;
      return {
        x: (Math.random() * 2 - 1) * m,
        y: (Math.random() * 2 - 1) * m,
      };
    },
    drawVignette(ctx, w, h) {
      if (flash <= 0) return;
      const g = ctx.createRadialGradient(
        w / 2,
        h / 2,
        Math.min(w, h) * 0.3,
        w / 2,
        h / 2,
        Math.max(w, h) * 0.7,
      );
      g.addColorStop(0, "rgba(192,53,74,0)");
      g.addColorStop(1, "rgba(192,53,74," + 0.5 * flash + ")");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    },
  };
}
