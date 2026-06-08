// End-of-run bosses, one per run length. Spawned when the run timer hits the chosen
// length (normal spawns stop); killing it = VICTORY. Tanky single duel — the player
// out-runs it and whittles the huge HP bar down. coinReward is banked on the kill.
export const BOSSES = {
  300: {
    id: "wraith",
    name: "The Gravewraith",
    emoji: "👿",
    size: 92,
    hp: 3600,
    speed: 56,
    dmg: 26,
    coinReward: 60,
  },
  600: {
    id: "dragon",
    name: "Ashmaw the Dragon",
    emoji: "🐲",
    size: 108,
    hp: 9000,
    speed: 52,
    dmg: 32,
    coinReward: 120,
  },
  900: {
    id: "sovereign",
    name: "The Bone Sovereign",
    emoji: "💀",
    size: 124,
    hp: 18000,
    speed: 48,
    dmg: 40,
    coinReward: 220,
  },
};

export function bossFor(runLength) {
  return BOSSES[runLength] || BOSSES[300];
}
