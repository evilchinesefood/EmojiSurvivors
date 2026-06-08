// Account-wide permanent upgrades bought with coins. Each level applies `mods`
// (folded by StatsModel.resolve) and costs cost(level) coins (level = current
// owned level, 0-based). Data-driven so new rows bolt on with no system changes.
function geo(base, mult) {
  return (level) => Math.round(base * Math.pow(mult, level));
}

export const POWER_GRID = {
  might: {
    id: "might",
    name: "Might",
    emoji: "💪",
    desc: "+5% damage / level",
    max: 5,
    cost: geo(50, 1.7),
    mods: [{ stat: "might", op: "mul", value: 1.05 }],
  },
  maxHp: {
    id: "maxHp",
    name: "Vitality",
    emoji: "❤️",
    desc: "+6% max HP / level",
    max: 5,
    cost: geo(50, 1.7),
    mods: [{ stat: "hpMul", op: "mul", value: 1.06 }],
  },
  moveSpeed: {
    id: "moveSpeed",
    name: "Swiftness",
    emoji: "🥾",
    desc: "+4% move speed / level",
    max: 5,
    cost: geo(45, 1.7),
    mods: [{ stat: "speedMul", op: "mul", value: 1.04 }],
  },
  recovery: {
    id: "recovery",
    name: "Recovery",
    emoji: "🩹",
    desc: "+0.2 HP/s / level",
    max: 5,
    cost: geo(60, 1.75),
    mods: [{ stat: "recovery", op: "add", value: 0.2 }],
  },
  area: {
    id: "area",
    name: "Reach",
    emoji: "🌀",
    desc: "+5% area / level",
    max: 5,
    cost: geo(55, 1.7),
    mods: [{ stat: "area", op: "mul", value: 1.05 }],
  },
  cooldown: {
    id: "cooldown",
    name: "Haste",
    emoji: "⏱️",
    desc: "+4% attack speed / level",
    max: 5,
    cost: geo(60, 1.75),
    mods: [{ stat: "cooldown", op: "mul", value: 1.04 }],
  },
  luck: {
    id: "luck",
    name: "Luck",
    emoji: "🍀",
    desc: "+8% luck / level",
    max: 5,
    cost: geo(55, 1.7),
    mods: [{ stat: "luck", op: "mul", value: 1.08 }],
  },
  magnet: {
    id: "magnet",
    name: "Magnet",
    emoji: "🧲",
    desc: "+15% pickup range / level",
    max: 5,
    cost: geo(45, 1.65),
    mods: [{ stat: "magnet", op: "mul", value: 1.15 }],
  },
  greed: {
    id: "greed",
    name: "Greed",
    emoji: "🤑",
    desc: "+8% coins / level",
    max: 5,
    cost: geo(60, 1.7),
    mods: [{ stat: "greed", op: "mul", value: 1.08 }],
  },
  growth: {
    id: "growth",
    name: "Growth",
    emoji: "📈",
    desc: "+5% XP gain / level",
    max: 5,
    cost: geo(60, 1.72),
    mods: [{ stat: "growth", op: "mul", value: 1.05 }],
  },
  revive: {
    id: "revive",
    name: "Revive",
    emoji: "😇",
    desc: "+1 extra life",
    max: 2,
    cost: geo(300, 2.2),
    mods: [{ stat: "revives", op: "add", value: 1 }],
  },
  reroll: {
    id: "reroll",
    name: "Reroll",
    emoji: "🎲",
    desc: "+1 level-up reroll",
    max: 3,
    cost: geo(120, 1.9),
    mods: [{ stat: "rerolls", op: "add", value: 1 }],
  },
};

export const POWER_GRID_IDS = Object.keys(POWER_GRID);
