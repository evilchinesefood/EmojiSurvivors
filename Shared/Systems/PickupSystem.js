// Gems / coins / drops collection + magnet vacuum. Gems & coins within the magnet
// radius accelerate toward the player; collected within the pickup radius. Health
// heals, chests grant level-ups (can roll evolutions via the choice pool), the
// magnet pickup vacuums everything on screen.
import { swapPop, emit } from "../Engine/State.js";

function vacuumToward(item, p, dt) {
  const dx = p.x - item.x;
  const dy = p.y - item.y;
  const d = Math.hypot(dx, dy) || 1;
  const sp = 240 + 520 * (1 - Math.min(1, d / 320));
  item.x += (dx / d) * sp * dt;
  item.y += (dy / d) * sp * dt;
  return d;
}

// Co-op: the nearest live unit (host or ally) attracts and collects. With no
// allies this always returns the player — the solo path is byte-identical.
function nearestUnit(state, x, y) {
  const p = state.player;
  let best = p;
  let bd = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
  for (const al of state.allies) {
    if (al.downed) continue;
    const d = (al.x - x) * (al.x - x) + (al.y - y) * (al.y - y);
    if (d < bd) {
      bd = d;
      best = al;
    }
  }
  return best;
}

export function stepPickups(state, dt) {
  const p = state.player;
  const m = state.modifiers;
  const multi = !!(state.allies && state.allies.length);
  const xpMul = m ? m.xpMul : 1;
  const coinMul = m ? m.coinMul : 1;
  const magR = p.magnetR;
  const pickR = p.pickupR + 14;
  const magR2 = magR * magR;
  const pickR2 = pickR * pickR;

  // gems → XP (shared pool: whoever grabs it, the host levels)
  for (let i = state.gems.length - 1; i >= 0; i--) {
    const g = state.gems[i];
    const u = multi ? nearestUnit(state, g.x, g.y) : p;
    let dx = u.x - g.x;
    let dy = u.y - g.y;
    if (g.vacuum || dx * dx + dy * dy < magR2) {
      g.vacuum = true;
      vacuumToward(g, u, dt);
      dx = u.x - g.x;
      dy = u.y - g.y;
    }
    if (dx * dx + dy * dy < pickR2) {
      p.xp += g.value * state.stats.growth * xpMul;
      emit(state, "gem", { value: g.value });
      state.pool.gem.release(g);
      swapPop(state.gems, i);
    }
  }

  // coins → bank (greed-scaled; co-op allies bank their own pickups)
  for (let i = state.coins.length - 1; i >= 0; i--) {
    const c = state.coins[i];
    const u = multi ? nearestUnit(state, c.x, c.y) : p;
    const dx = u.x - c.x;
    const dy = u.y - c.y;
    const d2 = dx * dx + dy * dy;
    if (c.vacuum || d2 < magR2) {
      c.vacuum = true;
      vacuumToward(c, u, dt);
    }
    const nd2 = (u.x - c.x) * (u.x - c.x) + (u.y - c.y) * (u.y - c.y);
    if (nd2 < pickR2) {
      const v = state.tainted
        ? 1
        : Math.max(1, Math.round(c.value * state.stats.greed * coinMul));
      if (u === p) p.coins += v;
      else u.coins += v;
      emit(state, "coin", { value: c.value });
      swapPop(state.coins, i);
    }
  }

  // drops: health / chest / magnet (collected on contact)
  for (let i = state.drops.length - 1; i >= 0; i--) {
    const d = state.drops[i];
    const dx = p.x - d.x;
    const dy = p.y - d.y;
    if (dx * dx + dy * dy > pickR2) continue;
    if (d.kind === "health") {
      p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.2);
      emit(state, "health");
    } else if (d.kind === "chest") {
      if (d.mimic && d.hops > 0) {
        // The Mimic bolts — chase it down (3 hops) for a triple payout.
        d.hops--;
        const a = state.combatRng.angle();
        d.x += Math.cos(a) * 170;
        d.y += Math.sin(a) * 170;
        emit(state, "mimic", { x: d.x, y: d.y });
        continue;
      }
      const n = d.mimic ? 3 : state.rollRng.range(1, 3);
      state.pendingLevelUps += n;
      state.awaitingLevelUp = true;
      emit(state, "chest", { levels: n });
    } else if (d.kind === "magnet") {
      for (const g of state.gems) g.vacuum = true;
      for (const c of state.coins) c.vacuum = true;
      emit(state, "magnet");
    }
    swapPop(state.drops, i);
  }
}
