// All damage resolution via the spatial hash: projectile↔enemy, one-shot AoE
// strikes, persistent orbit contact (per-weapon hit interval), and enemy↔player
// contact with i-frames + armor + revive. Enemies marked dead are compacted in a
// single sweep that drops loot, banks kills, and fires victory on a boss death.
import { swapPop, emit } from "../Engine/State.js";

const IFRAME = 0.6;

function heal(state, amt) {
  const p = state.player;
  p.hp = Math.min(p.maxHp, p.hp + amt);
}

function knockFrom(e, x, y, force = 50) {
  if (e.boss) return;
  const dx = e.x - x;
  const dy = e.y - y;
  const d = Math.hypot(dx, dy) || 1;
  e.knockX += (dx / d) * force;
  e.knockY += (dy / d) * force;
}

function hurt(state, e, dmg) {
  if (e.dead) return;
  e.hp -= dmg;
  e.flash = 0.09;
  emit(state, "damage", { x: e.x, y: e.y, amount: Math.round(dmg) });
  if (e.hp <= 0) e.dead = true;
}

function inCone(e, s) {
  const rx = e.x - s.x;
  const ry = e.y - s.y;
  const d = Math.hypot(rx, ry);
  if (d > s.range + e.size * 0.5) return false;
  if (d < 1) return true;
  const dot = (rx * s.dx + ry * s.dy) / d;
  return dot >= Math.cos(s.arc / 2);
}

function spawnGem(state, x, y, value) {
  const g = state.pool.gem.acquire();
  g.x = x;
  g.y = y;
  g.value = value;
  g.vx = 0;
  g.vy = 0;
  g.vacuum = false;
  g.emoji = value <= 1 ? "🔹" : value <= 3 ? "🔷" : value <= 10 ? "💠" : "🟣";
  g.size = value <= 1 ? 13 : value <= 3 ? 15 : value <= 10 ? 17 : 20;
  state.gems.push(g);
}

function dropLoot(state, e) {
  spawnGem(state, e.x, e.y, e.xp);
  if (e.coinChance && state.spawnRng.chance(e.coinChance)) {
    state.coins.push({
      x: e.x,
      y: e.y,
      value: e.elite ? 6 : 1,
      vx: 0,
      vy: 0,
      vacuum: false,
      emoji: "🪙",
      size: 15,
    });
  }
  if (!e.elite && state.spawnRng.chance(0.012))
    state.drops.push({ x: e.x, y: e.y, kind: "health", emoji: "🍖", size: 22 });
  if (!e.elite && state.spawnRng.chance(0.0025))
    state.drops.push({ x: e.x, y: e.y, kind: "magnet", emoji: "🧲", size: 22 });
  if (e.dropsChest)
    state.drops.push({ x: e.x, y: e.y, kind: "chest", emoji: "🎁", size: 26 });
}

function damagePlayer(state, raw) {
  const p = state.player;
  const dmg = Math.max(1, raw - state.stats.armor);
  p.hp -= dmg;
  p.invuln = IFRAME;
  p.hitFlash = 0.25;
  emit(state, "hurt");
  if (p.hp <= 0) {
    if (state.stats.revives > p.revivesUsed) {
      p.revivesUsed++;
      p.hp = p.maxHp;
      p.invuln = 2.5;
      emit(state, "revive");
    } else {
      p.hp = 0;
      state.outcome = "gameover";
      emit(state, "gameover");
    }
  }
}

export function stepCombat(state, dt) {
  const p = state.player;
  const near = state.neighbors;

  // 1) projectiles (move, lob arc/explode, collide)
  const projs = state.projectiles;
  for (let i = projs.length - 1; i >= 0; i--) {
    const pr = projs[i];
    let remove = false;
    if (pr.kind === "lob") {
      pr.t += dt;
      const f = Math.min(1, pr.t / pr.lobTime);
      pr.x = pr.sx + (pr.tx - pr.sx) * f;
      pr.y = pr.sy + (pr.ty - pr.sy) * f;
      if (f >= 1) {
        state.strikes.push({
          type: "circle",
          x: pr.tx,
          y: pr.ty,
          r: pr.splash,
          damage: pr.damage,
          weaponId: pr.weaponId,
          lifesteal: 0,
        });
        state.hazards.push({
          x: pr.tx,
          y: pr.ty,
          r: pr.splash,
          color: pr.color,
          life: 0.22,
          maxLife: 0.22,
        });
        emit(state, "explode", { x: pr.tx, y: pr.ty });
        remove = true;
      }
    } else {
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      pr.ttl -= dt;
      const dx = pr.x - p.x;
      const dy = pr.y - p.y;
      if (pr.ttl <= 0 || dx * dx + dy * dy > 1500 * 1500) remove = true;
      else {
        state.hash.queryCircle(pr.x, pr.y, pr.r + 28, near);
        for (let j = 0; j < near.length; j++) {
          const e = near[j];
          if (e.dead || pr.hitIds.has(e)) continue;
          const reach = e.size * 0.5 + pr.r;
          const ex = e.x - pr.x;
          const ey = e.y - pr.y;
          if (ex * ex + ey * ey <= reach * reach) {
            hurt(state, e, pr.damage);
            pr.hitIds.add(e);
            if (!e.boss) {
              const kl = Math.hypot(pr.vx, pr.vy) || 1;
              e.knockX += (pr.vx / kl) * 55;
              e.knockY += (pr.vy / kl) * 55;
            }
            if (pr.lifesteal) heal(state, pr.damage * pr.lifesteal);
            if (--pr.pierce < 0) {
              remove = true;
              break;
            }
          }
        }
      }
    }
    if (remove) {
      pr.hitIds.clear();
      state.pool.proj.release(pr);
      swapPop(projs, i);
    }
  }

  // 2) one-shot AoE strikes
  for (const s of state.strikes) {
    if (s.type === "circle") {
      state.hash.queryCircle(s.x, s.y, s.r, near);
      for (let j = 0; j < near.length; j++) {
        const e = near[j];
        if (e.dead) continue;
        const dx = e.x - s.x;
        const dy = e.y - s.y;
        const reach = s.r + e.size * 0.4;
        if (dx * dx + dy * dy <= reach * reach) {
          hurt(state, e, s.damage);
          knockFrom(e, s.x, s.y, 40);
          if (s.lifesteal) heal(state, s.damage * s.lifesteal);
        }
      }
    } else {
      state.hash.queryCircle(s.x, s.y, s.range, near);
      for (let j = 0; j < near.length; j++) {
        const e = near[j];
        if (e.dead) continue;
        if (inCone(e, s)) {
          hurt(state, e, s.damage);
          knockFrom(e, s.x, s.y, 70);
          if (s.lifesteal) heal(state, s.damage * s.lifesteal);
        }
      }
    }
  }
  state.strikes.length = 0;

  // 3) orbit bodies (continuous, gated per enemy by a per-weapon hit interval)
  for (const o of state.orbits) {
    state.hash.queryCircle(o.x, o.y, o.size, near);
    const reach = o.size * 0.5 + 8;
    const key = "orb_" + o.weaponId;
    for (let j = 0; j < near.length; j++) {
      const e = near[j];
      if (e.dead || e.hitTimers[key] > 0) continue;
      const dx = e.x - o.x;
      const dy = e.y - o.y;
      const rr = reach + e.size * 0.5;
      if (dx * dx + dy * dy <= rr * rr) {
        hurt(state, e, o.dmg);
        e.hitTimers[key] = o.hitCd;
        knockFrom(e, o.x, o.y, 30);
      }
    }
  }

  // 4) enemy → player contact (i-frames)
  if (p.invuln <= 0) {
    state.hash.queryCircle(p.x, p.y, 44, near);
    let worst = 0;
    for (let j = 0; j < near.length; j++) {
      const e = near[j];
      if (e.dead) continue;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const reach = 16 + e.size * 0.5;
      if (dx * dx + dy * dy <= reach * reach && e.dmg > worst) worst = e.dmg;
    }
    if (worst > 0) damagePlayer(state, worst);
  }

  // 5) death sweep — loot, kills, victory-on-boss
  const en = state.enemies;
  for (let i = en.length - 1; i >= 0; i--) {
    const e = en[i];
    if (!e.dead) continue;
    p.kills += 1;
    if (e.boss) {
      p.coins += e.coinReward || 0;
      state.spawn.bossAlive = false;
      state.outcome = "victory";
      emit(state, "kill", { x: e.x, y: e.y, boss: true });
      emit(state, "victory");
    } else {
      dropLoot(state, e);
      emit(state, "kill", { x: e.x, y: e.y, elite: e.elite });
    }
    state.pool.enemy.release(e);
    swapPop(en, i);
  }

  // hazards decay (render-only)
  for (let i = state.hazards.length - 1; i >= 0; i--) {
    const z = state.hazards[i];
    z.life -= dt;
    if (z.life <= 0) swapPop(state.hazards, i);
  }
}
