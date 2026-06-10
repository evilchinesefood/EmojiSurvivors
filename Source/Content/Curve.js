// Pure difficulty + progression curves. `difficulty(t)` is a pure function of
// elapsed seconds → the spawn/scaling knobs the Spawner reads. All knobs are
// monotonic in t within their clamps (asserted by Curve.Test.js).
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// Tuned for ~2x the old threat: a stationary player gets overrun, but skilled kiting
// stays viable. Because contact damage is i-frame-gated (one hit per 0.6s from the
// single worst overlapping enemy), DAMAGE is the lever that punishes standing still —
// hence the steep dmgScale; HP/density keep an active player honest without making a
// clean path impossible.
export function difficulty(t) {
  return {
    spawnInterval: clamp(0.8 - t * 0.001, 0.15, 0.8),
    cap: Math.min(54 + t * 0.3, 280),
    waveInterval: clamp(26 - t * 0.009, 13, 26),
    hpScale: 1 + t * 0.008,
    dmgScale: 1 + t * 0.0032,
    speedScale: 1 + t * 0.0004,
  };
}

// XP required to advance FROM `level` to level+1 (level is 1-based).
export function xpForLevel(level) {
  return Math.floor(5 + (level - 1) * 5 + Math.pow(level, 1.6));
}

export const RUN_LENGTHS = [300, 600, 900, 1800];
