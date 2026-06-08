// Pure difficulty + progression curves. `difficulty(t)` is a pure function of
// elapsed seconds → the spawn/scaling knobs the Spawner reads. All knobs are
// monotonic in t within their clamps (asserted by Curve.Test.js).
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export function difficulty(t) {
  return {
    spawnInterval: clamp(0.95 - t * 0.00088, 0.16, 0.95),
    cap: Math.min(60 + t * 0.34, 360),
    eliteChance: clamp((t / 600) * 0.12, 0, 0.16),
    waveInterval: clamp(24 - t * 0.008, 12, 24),
    hpScale: 1 + t * 0.0065,
    dmgScale: 1 + t * 0.0022,
    speedScale: 1 + t * 0.00035,
    valueScale: 1 + t * 0.0011, // XP/coin value of late-game gems
  };
}

// XP required to advance FROM `level` to level+1 (level is 1-based).
export function xpForLevel(level) {
  return Math.floor(5 + (level - 1) * 5 + Math.pow(level, 1.6));
}

export const RUN_LENGTHS = [300, 600, 900];
