// Run mutators. A player's selection (id → value) resolves into a per-run config the
// systems read. Modifiers unlock by wins/plays (cosmetic gate). Pure + DOM-free.
// type: "toggle" (boolean) or "choice" (one of `options`, with a `default`).

export const MOD_DEFS = {
  hard: {
    id: "hard",
    name: "Hard Mode",
    emoji: "💀",
    type: "toggle",
    desc: "Tougher, faster, deadlier — but ×1.4 XP & coins.",
    unlock: { free: true },
  },
  endless: {
    id: "endless",
    name: "Endless",
    emoji: "♾️",
    type: "toggle",
    desc: "No boss ending. Levels uncapped, difficulty rises forever. Score = kills + time.",
    unlock: { wins: 3 },
  },
  maxWeapons: {
    id: "maxWeapons",
    name: "Weapon Slots",
    emoji: "🗡️",
    type: "choice",
    desc: "How many weapons you can hold.",
    options: [3, 4, 5, 6, 7, 8],
    default: 6,
    unit: "",
    unlock: { free: true },
  },
  maxPassives: {
    id: "maxPassives",
    name: "Passive Slots",
    emoji: "💍",
    type: "choice",
    desc: "How many passives you can hold.",
    options: [3, 4, 5, 6, 8],
    default: 6,
    unit: "",
    unlock: { free: true },
  },
  magnetMax: {
    id: "magnetMax",
    name: "Giant Magnet",
    emoji: "🧲",
    type: "toggle",
    desc: "Auto-collect everything on screen.",
    unlock: { plays: 2 },
  },
  xpRate: {
    id: "xpRate",
    name: "XP Rate",
    emoji: "📈",
    type: "choice",
    desc: "Multiply XP from gems.",
    options: [0.5, 1, 2, 3],
    default: 1,
    unit: "×",
    unlock: { plays: 3 },
  },
  coinRate: {
    id: "coinRate",
    name: "Coin Rate",
    emoji: "🪙",
    type: "choice",
    desc: "Multiply coins earned.",
    options: [1, 2, 3],
    default: 1,
    unit: "×",
    unlock: { wins: 1 },
  },
  monsters: {
    id: "monsters",
    name: "Swarm Size",
    emoji: "👾",
    type: "choice",
    desc: "Multiply how many enemies spawn.",
    options: [0.5, 1, 1.5, 2, 3],
    default: 1,
    unit: "×",
    unlock: { plays: 3 },
  },
  monsterSpeed: {
    id: "monsterSpeed",
    name: "Swarm Speed",
    emoji: "💨",
    type: "choice",
    desc: "Multiply enemy move speed.",
    options: [0.75, 1, 1.25, 1.5],
    default: 1,
    unit: "×",
    unlock: { plays: 3 },
  },
  enemySize: {
    id: "enemySize",
    name: "Enemy Size",
    emoji: "🔍",
    type: "choice",
    desc: "Tiny or chonky monsters (cosmetic).",
    options: [0.7, 1, 1.4],
    default: 1,
    unit: "×",
    unlock: { free: true },
  },
  startLevel: {
    id: "startLevel",
    name: "Head Start",
    emoji: "🚀",
    type: "choice",
    desc: "Begin at a higher level.",
    options: [1, 5, 10, 20],
    default: 1,
    unit: "Lv ",
    unlock: { wins: 5 },
  },
  revives: {
    id: "revives",
    name: "Extra Lives",
    emoji: "😇",
    type: "choice",
    desc: "Start with bonus revives.",
    options: [0, 1, 3],
    default: 0,
    unit: "+",
    unlock: { wins: 1 },
  },
  glassCannon: {
    id: "glassCannon",
    name: "Glass Cannon",
    emoji: "💥",
    type: "toggle",
    desc: "×2 damage, ½ max HP.",
    unlock: { plays: 5 },
  },
  doubleEdge: {
    id: "doubleEdge",
    name: "Double-Edged",
    emoji: "⚖️",
    type: "toggle",
    desc: "×2 XP, ½ coins.",
    unlock: { plays: 5 },
  },
  oneWeapon: {
    id: "oneWeapon",
    name: "One Weapon",
    emoji: "☝️",
    type: "toggle",
    desc: "Only your starting weapon — level it sky-high.",
    unlock: { wins: 3 },
  },
  randomizer: {
    id: "randomizer",
    name: "Randomizer",
    emoji: "🎰",
    type: "toggle",
    desc: "Level-ups auto-pick a random option. No choices!",
    unlock: { plays: 10 },
  },
  bossRush: {
    id: "bossRush",
    name: "Boss Rush",
    emoji: "👑",
    type: "toggle",
    desc: "Elites pour in relentlessly.",
    unlock: { wins: 10 },
  },
  curse: {
    id: "curse",
    name: "Curse",
    emoji: "🔮",
    type: "choice",
    desc: "Crank difficulty AND rewards together.",
    options: [1, 1.5, 2, 3],
    default: 1,
    unit: "×",
    unlock: { wins: 5 },
  },
  hardcore: {
    id: "hardcore",
    name: "Hardcore",
    emoji: "☠️",
    type: "toggle",
    desc: "No revives. One life, no matter what.",
    unlock: { wins: 5 },
  },
};

export const MOD_IDS = Object.keys(MOD_DEFS);

// Default (non-effecting) value for a modifier.
export function modDefault(def) {
  return def.type === "toggle" ? false : def.default;
}

// Whether a selection value actually changes the run (for the "active" count / badge).
export function modActive(def, value) {
  return def.type === "toggle" ? !!value : value !== def.default;
}

// Display string for a choice value, e.g. "×2", "Lv 5", "+1", "6".
export function modValueLabel(def, value) {
  return (def.unit || "") + value;
}

// Human unlock requirement, e.g. "Win 3 runs", "Play 5 runs".
export function unlockLabel(def) {
  const u = def.unlock || {};
  if (u.free) return "";
  if (u.wins != null)
    return "Win " + u.wins + (u.wins === 1 ? " run" : " runs");
  if (u.plays != null)
    return "Play " + u.plays + (u.plays === 1 ? " run" : " runs");
  return "";
}

// Fold a selection { id: value } into the per-run config the systems read.
export function resolveModifiers(sel = {}) {
  const c = {
    enemyHpMul: 1,
    enemySpeedMul: 1,
    enemyDmgMul: 1,
    enemySizeMul: 1,
    spawnMul: 1,
    xpMul: 1,
    coinMul: 1,
    bossHpMul: 1,
    maxWeapons: 6,
    maxPassives: 6,
    maxWeaponLevel: 5,
    startLevel: 1,
    extraRevives: 0,
    statMods: [], // folded into StatsModel.resolve like character tilt
    endless: false,
    oneWeapon: false,
    randomizer: false,
    bossRush: false,
    active: [],
  };
  const on = (id) => {
    c.active.push(id);
  };
  if (sel.hard) {
    c.enemyHpMul *= 1.35;
    c.enemySpeedMul *= 1.2;
    c.enemyDmgMul *= 1.25;
    c.spawnMul *= 1.4;
    c.xpMul *= 1.4;
    c.coinMul *= 1.4;
    c.bossHpMul *= 1.5;
    on("hard");
  }
  if (sel.endless) {
    c.endless = true;
    c.maxWeaponLevel = 99;
    on("endless");
  }
  if (sel.maxWeapons && sel.maxWeapons !== 6) {
    c.maxWeapons = sel.maxWeapons;
    on("maxWeapons");
  }
  if (sel.maxPassives && sel.maxPassives !== 6) {
    c.maxPassives = sel.maxPassives;
    on("maxPassives");
  }
  if (sel.magnetMax) {
    c.statMods.push({ stat: "magnet", op: "mul", value: 100 });
    on("magnetMax");
  }
  if (sel.xpRate && sel.xpRate !== 1) {
    c.xpMul *= sel.xpRate;
    on("xpRate");
  }
  if (sel.coinRate && sel.coinRate !== 1) {
    c.coinMul *= sel.coinRate;
    on("coinRate");
  }
  if (sel.monsters && sel.monsters !== 1) {
    c.spawnMul *= sel.monsters;
    on("monsters");
  }
  if (sel.monsterSpeed && sel.monsterSpeed !== 1) {
    c.enemySpeedMul *= sel.monsterSpeed;
    on("monsterSpeed");
  }
  if (sel.enemySize && sel.enemySize !== 1) {
    c.enemySizeMul = sel.enemySize;
    on("enemySize");
  }
  if (sel.startLevel && sel.startLevel !== 1) {
    c.startLevel = sel.startLevel;
    on("startLevel");
  }
  if (sel.revives) {
    c.extraRevives += sel.revives;
    on("revives");
  }
  if (sel.glassCannon) {
    c.statMods.push(
      { stat: "might", op: "mul", value: 2 },
      { stat: "hpMul", op: "mul", value: 0.5 },
    );
    on("glassCannon");
  }
  if (sel.doubleEdge) {
    c.xpMul *= 2;
    c.coinMul *= 0.5;
    on("doubleEdge");
  }
  if (sel.oneWeapon) {
    c.oneWeapon = true;
    on("oneWeapon");
  }
  if (sel.randomizer) {
    c.randomizer = true;
    on("randomizer");
  }
  if (sel.bossRush) {
    c.bossRush = true;
    on("bossRush");
  }
  if (sel.curse && sel.curse > 1) {
    const k = sel.curse;
    c.enemyHpMul *= k;
    c.enemySpeedMul *= 1 + (k - 1) * 0.3;
    c.spawnMul *= k;
    c.xpMul *= k;
    c.coinMul *= k;
    c.bossHpMul *= k;
    on("curse");
  }
  if (sel.hardcore) {
    c.extraRevives = -99; // wipes any revives
    on("hardcore");
  }
  return c;
}
