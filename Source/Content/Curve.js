// Pure difficulty + progression curves. `difficulty(t)` is a pure function of
// elapsed seconds → the spawn/scaling knobs the Spawner reads. All knobs are
// monotonic in t within their clamps (asserted by Curve.Test.js).
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export function difficulty(t) {
  return {
    spawnInterval: clamp(0.92 - t * 0.0008, 0.2, 0.92),
    cap: Math.min(46 + t * 0.26, 235),
    eliteChance: clamp((t / 600) * 0.12, 0, 0.16),
    waveInterval: clamp(28 - t * 0.0085, 15, 28),
    hpScale: 1 + t * 0.0058,
    dmgScale: 1 + t * 0.0015,
    speedScale: 1 + t * 0.0003,
    valueScale: 1 + t * 0.0011, // XP/coin value of late-game gems
  };
}

// XP required to advance FROM `level` to level+1 (level is 1-based).
export function xpForLevel(level) {
  return Math.floor(5 + (level - 1) * 5 + Math.pow(level, 1.6));
}

export const RUN_LENGTHS = [300, 600, 900];
