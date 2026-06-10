// Passive items. `mods` apply once per owned level (folded by StatsModel.resolve).
// Six of these are weapon-evolution partners; Wings is a pure-stat pick.
// Emoji here are used on the (bespoke) level-up/character cards, never in WA chrome.
export const PASSIVES = {
  spellFocus: {
    id: "spellFocus",
    name: "Spell Focus",
    emoji: "🧠",
    desc: "+8% attack speed",
    max: 5,
    mods: [{ stat: "cooldown", op: "mul", value: 1.08 }],
  },
  hollowHeart: {
    id: "hollowHeart",
    name: "Hollow Heart",
    emoji: "🫀",
    desc: "+12% max HP",
    max: 5,
    mods: [{ stat: "hpMul", op: "mul", value: 1.12 }],
  },
  echoStone: {
    id: "echoStone",
    name: "Echo Stone",
    emoji: "🔮",
    desc: "+12% effect duration",
    max: 5,
    mods: [{ stat: "duration", op: "mul", value: 1.12 }],
  },
  waxCandle: {
    id: "waxCandle",
    name: "Wax Candle",
    emoji: "🕯️",
    desc: "+10% area",
    max: 5,
    mods: [{ stat: "area", op: "mul", value: 1.1 }],
  },
  spinach: {
    id: "spinach",
    name: "Spinach",
    emoji: "🥬",
    desc: "+10% might",
    max: 5,
    mods: [{ stat: "might", op: "mul", value: 1.1 }],
  },
  bracer: {
    id: "bracer",
    name: "Bracer",
    emoji: "🧤",
    desc: "+1 projectile",
    max: 3,
    mods: [{ stat: "projCount", op: "add", value: 1 }],
  },
  wings: {
    id: "wings",
    name: "Wings",
    emoji: "🪽",
    desc: "+8% move speed",
    max: 5,
    mods: [{ stat: "speedMul", op: "mul", value: 1.08 }],
  },
  ironSkin: {
    id: "ironSkin",
    name: "Iron Skin",
    emoji: "🪨",
    desc: "+1 armor / level",
    max: 3,
    mods: [{ stat: "armor", op: "add", value: 1 }],
  },
  luckyCharm: {
    id: "luckyCharm",
    name: "Lucky Charm",
    emoji: "🃏",
    desc: "+10% luck, +6% coins",
    max: 4,
    mods: [
      { stat: "luck", op: "mul", value: 1.1 },
      { stat: "greed", op: "mul", value: 1.06 },
    ],
  },
  graveDust: {
    id: "graveDust",
    name: "Grave Dust",
    emoji: "⚱️",
    desc: "+8% might",
    max: 5,
    mods: [{ stat: "might", op: "mul", value: 1.08 }],
  },
};

export const PASSIVE_IDS = Object.keys(PASSIVES);
