// Fixed-timestep sim + decoupled render. The accumulator steps the sim in fixed
// 1/60 s increments (catch-up capped to avoid the spiral of death), then renders
// once per rAF. Determinism (and the headless probe) depend on the fixed STEP.
//
// stepSim is the system pipeline. It grows by milestone; it stays DOM-free so the
// probe can drive it under node. It only advances while the run is live — the loop
// caller gates on the PLAYING state, and stepSim itself bails when a level-up is
// pending or the run is over.
import { movePlayer, stepEnemies } from "../Systems/Movement.js";
import { stepSpawner } from "../Systems/Spawner.js";
import { stepWeapons } from "../Systems/WeaponSystem.js";
import { stepCombat } from "../Systems/CombatSystem.js";
import { stepPickups } from "../Systems/PickupSystem.js";
import { stepLeveling } from "../Systems/Leveling.js";

export const STEP = 1 / 60;
const MAX_FRAME = 0.25;

function rebuildHash(state) {
  const h = state.hash;
  h.clear();
  const e = state.enemies;
  for (let i = 0; i < e.length; i++) h.insert(e[i]);
}

export function stepSim(state, dt) {
  if (state.outcome || state.awaitingLevelUp) return;
  const p = state.player;
  movePlayer(state, dt); // enemy separation uses last step's hash (1-frame stale, fine)
  stepEnemies(state, dt);
  stepSpawner(state, dt);
  rebuildHash(state); // refresh AFTER moves + spawns so combat queries are accurate
  stepWeapons(state, dt);
  stepCombat(state, dt);
  stepPickups(state, dt);
  stepLeveling(state);
  if (state.stats.recovery > 0 && p.hp < p.maxHp) {
    p.hp = Math.min(p.maxHp, p.hp + state.stats.recovery * dt);
  }
  if (p.invuln > 0) p.invuln -= dt;
  if (p.hitFlash > 0) p.hitFlash -= dt;
  if (state.devil > 0) state.devil -= dt;
  state.time += dt;
}

export function createLoop(update, render) {
  let last = 0;
  let acc = 0;
  let raf = 0;
  let running = false;
  let timescale = 1; // fast-forward: 1× / 2× / 4× — runs more fixed steps per frame

  function frame(nowMs) {
    if (!running) return;
    const now = nowMs / 1000;
    let dt = now - last;
    last = now;
    if (dt > MAX_FRAME) dt = MAX_FRAME;
    acc += dt * timescale;
    let steps = 0;
    while (acc >= STEP) {
      update(STEP);
      acc -= STEP;
      if (++steps > 300) {
        acc = 0;
        break;
      }
    }
    render(acc / STEP);
    raf = requestAnimationFrame(frame);
  }

  return {
    start() {
      if (running) return;
      running = true;
      last = performance.now() / 1000;
      acc = 0;
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
    setTimescale(n) {
      timescale = n;
    },
    get timescale() {
      return timescale;
    },
  };
}
