// All damage resolution via the spatial hash: projectile↔enemy, one-shot AoE
// strikes, persistent orbit contact (per-weapon hit interval), and enemy↔player
// contact with i-frames + armor + revive. Enemies marked dead are compacted in a
// single sweep that drops loot, banks kills, and fires victory on a boss death.
import { swapPop, emit } from "../Engine/State.js";

const IFRAME = 0.6;
const DEVIL_LINGER = 4; // kill #666 horns show this long, then fade out

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
  let d = dmg;
  // Real crits (grid row): rolled only when the stat is owned, so vanilla runs
  // consume zero extra RNG and probe streams stay identical.
  if (
    state.stats.critChance > 0 &&
    state.combatRng.chance(state.stats.critChance)
  )
    d *= 1.5;
  e.hp -= d;
  e.flash = 0.09;
  const amount = Math.round(d);
  // A "crit" is just a chunky hit relative to the target — drives gold floaters + a pop.
  if (d >= e.maxHp * 0.18) emit(state, "crit", { x: e.x, y: e.y, amount });
  else emit(state, "damage", { x: e.x, y: e.y, amount });
  // Last Rites: non-boss foes left under 10% max HP are reaped outright.
  if (
    state.gimmick === "lastRites" &&
    !e.boss &&
    e.hp > 0 &&
    e.hp < e.maxHp * 0.1
  ) {
    e.hp = 0;
    emit(state, "reap", { x: e.x, y: e.y });
  }
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
  if (e.coinChance && state.combatRng.chance(e.coinChance)) {
    state.coins.push({
      x: e.x,
      y: e.y,
      // Potato Economy (tainted save): every coin is a potato worth 1.
      value: state.tainted ? 1 : e.elite ? 12 : 3,
      vx: 0,
      vy: 0,
      vacuum: false,
      emoji: state.tainted ? "🥔" : "🪙",
      size: 15,
    });
  }
  // Easter-egg coin bursts (Disco Wisp, Karen) — potato rules still apply.
  for (let k = 0; k < (e.coinBurst || 0); k++) {
    state.coins.push({
      x: e.x + state.combatRng.float(-26, 26),
      y: e.y + state.combatRng.float(-26, 26),
      value: state.tainted ? 1 : 3,
      vx: 0,
      vy: 0,
      vacuum: false,
      emoji: state.tainted ? "🥔" : "🪙",
      size: 15,
    });
  }
  if (e.kind === "disco") emit(state, "disco", { x: e.x, y: e.y });
  if (e.kind === "karen") emit(state, "karen", { x: e.x, y: e.y });
  if (!e.elite && state.combatRng.chance(0.012))
    state.drops.push({ x: e.x, y: e.y, kind: "health", emoji: "🍖", size: 22 });
  if (!e.elite && state.combatRng.chance(0.0025))
    state.drops.push({ x: e.x, y: e.y, kind: "magnet", emoji: "🧲", size: 22 });
  if (e.dropsChest) {
    // ~1/12 elite chests is a Mimic: it hops away three times before it's caught.
    const mimic = state.combatRng.chance(1 / 12);
    state.drops.push({
      x: e.x,
      y: e.y,
      kind: "chest",
      emoji: "🎁",
      size: 26,
      mimic,
      hops: mimic ? 3 : 0,
    });
  }
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
          if (e.dead || pr.hitIds.has(e.uid)) continue;
          const reach = e.size * 0.5 + pr.r;
          const ex = e.x - pr.x;
          const ey = e.y - pr.y;
          if (ex * ex + ey * ey <= reach * reach) {
            hurt(state, e, pr.damage);
            pr.hitIds.add(e.uid);
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

  // 4) enemy → player contact (i-frames). A crowd bites harder than a lone foe: the hit
  // scales with how many enemies are actually on you, so standing in the swarm is fatal
  // while kiting (few overlaps) stays survivable. Capped so a huge pile can't one-shot
  // through the i-frame window.
  if (p.invuln <= 0) {
    state.hash.queryCircle(p.x, p.y, 44, near);
    let worstE = null;
    let crowd = 0;
    for (let j = 0; j < near.length; j++) {
      const e = near[j];
      if (e.dead || e.dmg <= 0) continue; // harmless specials (disco) can't hit
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const reach = 16 + e.size * 0.5;
      if (dx * dx + dy * dy <= reach * reach) {
        crowd++;
        if (!worstE || e.dmg > worstE.dmg) worstE = e;
      }
    }
    if (worstE) {
      // Shadowstep: dodge the hit outright; the dodge consumes the i-frame window
      // so it can't re-roll every tick while standing in the swarm.
      if (state.gimmick === "shadowstep" && state.combatRng.chance(0.2)) {
        p.invuln = IFRAME;
        emit(state, "dodge");
      } else {
        const crowdMul = Math.min(1 + (crowd - 1) * 0.6, 5); // each extra attacker piles on
        damagePlayer(state, worstE.dmg * crowdMul);
        const reflect =
          state.stats.thorns +
          (state.gimmick === "backlash" ? 6 + worstE.maxHp * 0.1 : 0);
        if (reflect > 0) hurt(state, worstE, reflect);
      }
    }
  }

  // 4b) enemy → co-op ally contact: same crowd rule, but no revives — allies go
  // down and respawn instead of ending the run. Skipped entirely in solo runs.
  const allies = state.allies;
  if (allies && allies.length) {
    for (const al of allies) {
      if (al.downed || al.invuln > 0) continue;
      state.hash.queryCircle(al.x, al.y, 44, near);
      let worst = null;
      let crowd = 0;
      for (let j = 0; j < near.length; j++) {
        const e = near[j];
        if (e.dead || e.dmg <= 0) continue;
        const dx = e.x - al.x;
        const dy = e.y - al.y;
        const reach = 16 + e.size * 0.5;
        if (dx * dx + dy * dy <= reach * reach) {
          crowd++;
          if (!worst || e.dmg > worst.dmg) worst = e;
        }
      }
      if (worst) {
        const crowdMul = Math.min(1 + (crowd - 1) * 0.6, 5);
        al.hp -= Math.max(1, worst.dmg * crowdMul - state.stats.armor);
        al.invuln = IFRAME;
        emit(state, "allyhurt", { id: al.id, x: al.x, y: al.y });
        if (al.hp <= 0) {
          al.hp = 0;
          al.downed = true;
          al.respawnT = 15;
          emit(state, "allydown", { id: al.id, x: al.x, y: al.y });
        }
      }
    }
  }

  // 5) death sweep — loot, kills, victory-on-boss
  const en = state.enemies;
  for (let i = en.length - 1; i >= 0; i--) {
    const e = en[i];
    if (!e.dead) continue;
    p.kills += 1;
    if (p.kills === 666) {
      state.devil = DEVIL_LINGER;
      emit(state, "devil", { x: e.x, y: e.y });
    }
    if (e.boss) {
      // The biggest coin source must honor greed + the run's coin multiplier too.
      // (Tainted saves: the boss drops exactly one potato.)
      const coinMul = state.modifiers ? state.modifiers.coinMul : 1;
      p.coins += state.tainted
        ? 1
        : Math.round((e.coinReward || 0) * state.stats.greed * coinMul);
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
