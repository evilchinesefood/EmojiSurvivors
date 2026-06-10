// 10 characters: a starting weapon + a stat tilt + a unique gimmick. The first six
// are free; the rest carry a `cost` and are coin-unlocked in the select screen.
// `gimmick` strings drive dynamic logic in the systems (Arcane Echo/Shadowstep →
// WeaponSystem/CombatSystem, Regrowth/Second Sight → Leveling, Rage → WeaponSystem,
// Last Rites/Backlash → CombatSystem). The static parts live in `tilt` so
// StatsModel folds them.
export const CHARACTERS = {
  knight: {
    id: "knight",
    name: "Knight",
    emoji: "🛡️",
    weapon: "whip",
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
    blurb: "Tanky bruiser — angrier as he bleeds.",
    tilt: [
      { stat: "hpMul", op: "mul", value: 1.25 },
      { stat: "cooldown", op: "mul", value: 0.85 },
    ],
    gimmick: "rage",
    passive: { name: "Rage", emoji: "😤", desc: "+1% dmg per 1% missing HP" },
  },
  necromancer: {
    id: "necromancer",
    name: "Necromancer",
    emoji: "🧛",
    weapon: "boneSpear",
    blurb: "Glass cannon who feeds on the kill.",
    tilt: [
      { stat: "might", op: "mul", value: 1.15 },
      { stat: "hpMul", op: "mul", value: 0.9 },
    ],
    gimmick: "bloodPact",
    passive: {
      name: "Blood Pact",
      emoji: "🩸",
      desc: "10% on attack: heal 1% max HP",
    },
  },
  witch: {
    id: "witch",
    name: "Witch",
    emoji: "🧙‍♀️",
    weapon: "orbit",
    cost: 500,
    blurb: "Sees more than most. Her familiars circle.",
    tilt: [
      { stat: "luck", op: "mul", value: 1.25 },
      { stat: "hpMul", op: "mul", value: 0.9 },
    ],
    gimmick: "secondSight",
    passive: {
      name: "Second Sight",
      emoji: "👁️",
      desc: "Level-up hands show 4 cards",
    },
  },
  ninja: {
    id: "ninja",
    name: "Ninja",
    emoji: "🥷",
    weapon: "stars",
    cost: 800,
    blurb: "Strikes from shadow; hard to pin down.",
    tilt: [
      { stat: "speedMul", op: "mul", value: 1.2 },
      { stat: "hpMul", op: "mul", value: 0.85 },
    ],
    gimmick: "shadowstep",
    passive: {
      name: "Shadowstep",
      emoji: "💨",
      desc: "20% chance to dodge any hit",
    },
  },
  pumpkinKing: {
    id: "pumpkinKing",
    name: "Pumpkin King",
    emoji: "🎃",
    weapon: "pumpkinBomb",
    cost: 800,
    blurb: "Royalty of the patch. Hits back.",
    tilt: [
      { stat: "hpMul", op: "mul", value: 1.2 },
      { stat: "speedMul", op: "mul", value: 0.9 },
    ],
    gimmick: "backlash",
    passive: {
      name: "Backlash",
      emoji: "🌵",
      desc: "Attackers take 6 + 10% their max HP",
    },
  },
  reaper: {
    id: "reaper",
    name: "Reaper",
    emoji: "☠️",
    weapon: "scythe",
    cost: 1200,
    blurb: "The deadline, personified.",
    tilt: [
      { stat: "might", op: "mul", value: 1.15 },
      { stat: "speedMul", op: "mul", value: 0.92 },
    ],
    gimmick: "lastRites",
    passive: {
      name: "Last Rites",
      emoji: "⚰️",
      desc: "Foes under 10% HP are reaped",
    },
  },
};

export const CHARACTER_IDS = Object.keys(CHARACTERS);
export const STARTER_ID = "knight";
