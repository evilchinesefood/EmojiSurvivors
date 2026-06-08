// Weapon cooldowns + firing. Spawns projectiles (pooled) and emits one-shot AoE
// strikes; CombatSystem moves projectiles and resolves all damage. Orbit weapons are
// always-on bodies repositioned each step. Damage is sampled at fire time (so Rage's
// missing-HP bonus and Might fold in), and Arcane Echo can re-fire a volley.
import { WEAPONS, scaleWeapon } from "../Content/Weapons.js";
import { emit } from "../Engine/State.js";

export function damageMul(state) {
  let m = state.stats.might;
  if (state.gimmick === "rage") {
    const p = state.player;
    m *= 1 + (1 - p.hp / p.maxHp);
  }
  return m;
}

function nearest(state) {
  const p = state.player;
  const en = state.enemies;
  let best = null;
  let bd = Infinity;
  for (let i = 0; i < en.length; i++) {
    const e = en[i];
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const d = dx * dx + dy * dy;
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  return best;
}

function spawnProj(
  state,
  x,
  y,
  vx,
  vy,
  dmg,
  pierce,
  emoji,
  size,
  ttl,
  wid,
  ls,
) {
  const pr = state.pool.proj.acquire();
  pr.hitIds.clear();
  pr.kind = "proj";
  pr.x = x;
  pr.y = y;
  pr.vx = vx;
  pr.vy = vy;
  pr.damage = dmg;
  pr.pierce = pierce;
  pr.emoji = emoji;
  pr.size = size;
  pr.r = size * 0.5 + 6;
  pr.ttl = ttl;
  pr.weaponId = wid;
  pr.lifesteal = ls || 0;
  state.projectiles.push(pr);
}

function spawnLob(state, x, y, tx, ty, dmg, def, area) {
  const pr = state.pool.proj.acquire();
  pr.hitIds.clear();
  pr.kind = "lob";
  pr.x = x;
  pr.y = y;
  pr.sx = x;
  pr.sy = y;
  pr.tx = tx;
  pr.ty = ty;
  pr.t = 0;
  pr.lobTime = def.lobTime || 0.55;
  pr.splash = (def.splash || 56) * area;
  pr.damage = dmg;
  pr.emoji = def.emoji;
  pr.size = 22;
  pr.weaponId = def.id;
  pr.color = def.color || "rgba(232,193,74,";
  state.projectiles.push(pr);
}

function pushHazard(state, x, y, r, color, life) {
  state.hazards.push({ x, y, r, color, life, maxLife: life });
}

function lobTarget(state, p) {
  const t = nearest(state);
  if (t)
    return {
      x: t.x + state.combatRng.float(-18, 18),
      y: t.y + state.combatRng.float(-18, 18),
    };
  const a = state.combatRng.angle();
  const r = state.combatRng.float(90, 220);
  return { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r };
}

function fire(state, w, def, sc, stats, dm) {
  const p = state.player;
  const dmg = sc.damage * dm;
  const ranged =
    def.behavior === "aimed" ||
    def.behavior === "spread" ||
    def.behavior === "nova";
  const count = sc.count + (ranged ? stats.projCount : 0);
  const pierce = sc.pierce;
  const speed = (def.speed || 0) * stats.projSpeed;
  const area = stats.area * sc.area;

  switch (def.behavior) {
    case "aimed": {
      const t = nearest(state);
      let dx = p.facing.x;
      let dy = p.facing.y;
      if (t) {
        dx = t.x - p.x;
        dy = t.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        dx /= d;
        dy /= d;
      }
      const base = Math.atan2(dy, dx);
      const spr = count > 1 ? 0.16 : 0;
      for (let i = 0; i < count; i++) {
        const a = base + (i - (count - 1) / 2) * spr;
        spawnProj(
          state,
          p.x,
          p.y,
          Math.cos(a) * speed,
          Math.sin(a) * speed,
          dmg,
          pierce,
          def.emoji,
          18,
          1.7,
          def.id,
          def.lifesteal,
        );
      }
      break;
    }
    case "spread": {
      const a0 = Math.atan2(p.facing.y, p.facing.x);
      const width = def.spread * Math.max(1, count - 1);
      for (let i = 0; i < count; i++) {
        const a = count > 1 ? a0 + (i / (count - 1) - 0.5) * width : a0;
        spawnProj(
          state,
          p.x,
          p.y,
          Math.cos(a) * speed,
          Math.sin(a) * speed,
          dmg,
          pierce,
          def.emoji,
          16,
          1.5,
          def.id,
          0,
        );
      }
      break;
    }
    case "nova": {
      w.alt = (w.alt || 0) + 0.09;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + w.alt;
        spawnProj(
          state,
          p.x,
          p.y,
          Math.cos(a) * speed,
          Math.sin(a) * speed,
          dmg,
          pierce,
          def.emoji,
          18,
          1.9,
          def.id,
          0,
        );
      }
      break;
    }
    case "whip": {
      const sweeps = Math.max(1, count);
      for (let i = 0; i < sweeps; i++) {
        w.alt = (w.alt || 0) + 1;
        let dx = p.facing.x;
        let dy = p.facing.y;
        if (i % 2 === 1 || (sweeps === 1 && w.alt % 2 === 0)) {
          dx = -dx;
          dy = -dy;
        }
        const range = def.range * area;
        state.strikes.push({
          type: "cone",
          x: p.x,
          y: p.y,
          dx,
          dy,
          range,
          arc: def.arc,
          damage: dmg,
          weaponId: def.id,
          lifesteal: def.lifesteal || 0,
        });
        pushHazard(
          state,
          p.x + dx * range * 0.5,
          p.y + dy * range * 0.5,
          range * 0.5,
          def.color || "rgba(236,233,224,",
          0.14,
        );
      }
      break;
    }
    case "aura": {
      const radius = def.radius * area;
      state.strikes.push({
        type: "circle",
        x: p.x,
        y: p.y,
        r: radius,
        damage: dmg,
        weaponId: def.id,
        lifesteal: 0,
      });
      pushHazard(state, p.x, p.y, radius, def.color || "rgba(116,224,74,", 0.2);
      break;
    }
    case "lob": {
      for (let i = 0; i < count; i++) {
        const t = lobTarget(state, p);
        spawnLob(state, p.x, p.y, t.x, t.y, dmg, def, area);
      }
      break;
    }
  }
}

function ensureOrbits(state, w, def, sc, stats, dm) {
  const desired = sc.count;
  const radius = def.radius * stats.area * sc.area;
  let mine = 0;
  for (const o of state.orbits) if (o.w === w) mine++;
  if (mine !== desired) {
    for (let i = state.orbits.length - 1; i >= 0; i--) {
      if (state.orbits[i].w === w) state.orbits.splice(i, 1);
    }
    for (let i = 0; i < desired; i++) {
      state.orbits.push({
        w,
        offset: (i / desired) * Math.PI * 2,
        emoji: def.emoji,
        size: def.size || 22,
        radius,
        base: sc.damage,
        dmg: sc.damage * dm,
        weaponId: def.id,
        hitCd: def.hitCd || 0.35,
        x: state.player.x,
        y: state.player.y,
      });
    }
  } else {
    for (const o of state.orbits)
      if (o.w === w) {
        o.radius = radius;
        o.base = sc.damage;
        o.dmg = sc.damage * dm;
      }
  }
  w.orbAngle = (w.orbAngle || 0) + (def.orbitSpeed || 2.5) * (1 / 60);
}

function updateOrbits(state) {
  const p = state.player;
  for (const o of state.orbits) {
    const ang = (o.w.orbAngle || 0) + o.offset;
    o.x = p.x + Math.cos(ang) * o.radius;
    o.y = p.y + Math.sin(ang) * o.radius;
  }
}

export function stepWeapons(state, dt) {
  const stats = state.stats;
  const dm = damageMul(state);
  state.player.dmgMul = dm;

  for (const w of state.player.weapons) {
    const def = WEAPONS[w.id];
    if (!def) continue;
    const sc = scaleWeapon(def, w.level);
    if (def.behavior === "orbit") {
      ensureOrbits(state, w, def, sc, stats, dm);
      continue;
    }
    const interval = Math.max(0.05, sc.interval / stats.cooldown);
    w.cd -= dt;
    if (w.cd > 0) continue;
    w.cd += interval;
    fire(state, w, def, sc, stats, dm);
    if (state.gimmick === "arcaneEcho" && state.combatRng.chance(0.15)) {
      fire(state, w, def, sc, stats, dm);
      emit(state, "echo");
    }
  }
  updateOrbits(state);
}
