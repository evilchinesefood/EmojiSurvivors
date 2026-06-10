// Camera shake + hurt vignette (view-layer juice). Trauma decays each frame; the
// shake offset is trauma² × random so small hits barely nudge and big ones jolt.
// The hurt flash drives a DOM overlay's opacity (the 3D scene stays untouched).
export function makeFx(vignetteEl) {
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
      if (flash > 0) {
        flash = Math.max(0, flash - dt * 3);
        if (vignetteEl) vignetteEl.style.opacity = String(flash * 0.85);
      } else if (vignetteEl && vignetteEl.style.opacity !== "0") {
        vignetteEl.style.opacity = "0";
      }
    },
    // Positional jitter (world units) + a roll wobble (radians) for the camera.
    offset() {
      if (trauma <= 0) return { x: 0, z: 0, roll: 0 };
      const m = trauma * trauma;
      return {
        x: (Math.random() * 2 - 1) * m * 7,
        z: (Math.random() * 2 - 1) * m * 7,
        roll: (Math.random() * 2 - 1) * m * 0.045,
      };
    },
  };
}
