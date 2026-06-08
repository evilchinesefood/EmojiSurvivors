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

export function stepPickups(state, dt) {
  const p = state.player;
  const magR = p.magnetR;
  const pickR = p.pickupR + 14;
  const magR2 = magR * magR;
  const pickR2 = pickR * pickR;

  // gems → XP
  for (let i = state.gems.length - 1; i >= 0; i--) {
    const g = state.gems[i];
    let dx = p.x - g.x;
    let dy = p.y - g.y;
    if (g.vacuum || dx * dx + dy * dy < magR2) {
      g.vacuum = true;
      vacuumToward(g, p, dt);
      dx = p.x - g.x;
      dy = p.y - g.y;
    }
    if (dx * dx + dy * dy < pickR2) {
      p.xp += g.value * state.stats.growth;
      emit(state, "gem", { value: g.value });
      state.pool.gem.release(g);
      swapPop(state.gems, i);
    }
  }

  // coins → bank (greed-scaled)
  for (let i = state.coins.length - 1; i >= 0; i--) {
    const c = state.coins[i];
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    const d2 = dx * dx + dy * dy;
    if (c.vacuum || d2 < magR2) {
      c.vacuum = true;
      vacuumToward(c, p, dt);
    }
    const nd2 = (p.x - c.x) * (p.x - c.x) + (p.y - c.y) * (p.y - c.y);
    if (nd2 < pickR2) {
      p.coins += Math.max(1, Math.round(c.value * state.stats.greed));
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
      const n = state.rollRng.range(1, 3);
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
