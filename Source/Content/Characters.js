// 5 characters: a starting weapon + a stat tilt + a unique gimmick. Knight is free;
// the rest are coin-unlocked. `gimmick` strings drive dynamic logic in the systems
// (Arcane Echo → WeaponSystem, Regrowth → Leveling, Rage → CombatSystem). The
// static parts of each passive live in `tilt` so StatsModel folds them.
export const CHARACTERS = {
  knight: {
    id: "knight",
    name: "Knight",
    emoji: "🛡️",
    weapon: "whip",
    price: 0,
    blurb: "Balanced. A wall with a whip.",
    tilt: [
      { stat: "hpMul", op: "mul", value: 1.1 },
      { stat: "armor", op: "add", value: 1 },
    ],
    gimmick: "stalwart",
    passive: {
      name: "Stalwart",
      emoji: "🛡️",
      desc: "+1 armor (min 1 dmg taken)",
    },
  },
  mage: {
    id: "mage",
    name: "Mage",
    emoji: "🧙",
    weapon: "bolt",
    price: 500,
    blurb: "Glass cannon. Hits hard, dies fast.",
    tilt: [
      { stat: "might", op: "mul", value: 1.2 },
      { stat: "hpMul", op: "mul", value: 0.8 },
    ],
    gimmick: "arcaneEcho",
    passive: {
      name: "Arcane Echo",
      emoji: "🔮",
      desc: "15% chance to fire twice",
    },
  },
  rogue: {
    id: "rogue",
    name: "Rogue",
    emoji: "🗡️",
    weapon: "daggers",
    price: 600,
    blurb: "Fast and greedy. Collects everything.",
    tilt: [
      { stat: "speedMul", op: "mul", value: 1.2 },
      { stat: "luck", op: "mul", value: 1.15 },
      { stat: "greed", op: "mul", value: 1.3 },
      { stat: "magnet", op: "mul", value: 1.5 },
    ],
    gimmick: "greedy",
    passive: { name: "Greedy", emoji: "🤑", desc: "+30% coins, big magnet" },
  },
  druid: {
    id: "druid",
    name: "Druid",
    emoji: "🌿",
    weapon: "aura",
    price: 600,
    blurb: "Slow regenerator wreathed in thorns.",
    tilt: [
      { stat: "recovery", op: "add", value: 1 },
      { stat: "speedMul", op: "mul", value: 0.9 },
    ],
    gimmick: "regrowth",
    passive: {
      name: "Regrowth",
      emoji: "🌱",
      desc: "Heal 5% max HP on level-up",
    },
  },
  barbarian: {
    id: "barbarian",
    name: "Barbarian",
    emoji: "🪓",
    weapon: "axe",
    price: 800,
    blurb: "Tanky bruiser — angrier as he bleeds.",
    tilt: [
      { stat: "hpMul", op: "mul", value: 1.25 },
      { stat: "cooldown", op: "mul", value: 0.85 },
    ],
    gimmick: "rage",
    passive: { name: "Rage", emoji: "😤", desc: "+1% dmg per 1% missing HP" },
  },
};

export const CHARACTER_IDS = Object.keys(CHARACTERS);
export const STARTER_ID = "knight";
