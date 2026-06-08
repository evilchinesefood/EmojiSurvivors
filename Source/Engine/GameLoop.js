// Fixed-timestep sim + decoupled render. The accumulator steps the sim in fixed
// 1/60 s increments (catch-up capped to avoid the spiral of death), then renders
// once per rAF. Determinism (and the headless probe) depend on the fixed STEP.
//
// stepSim is the system pipeline. It grows by milestone; it stays DOM-free so the
// probe can drive it under node. It only advances while the run is live — the loop
// caller gates on the PLAYING state, and stepSim itself bails when a level-up is
// pending or the run is over.
import { movePlayer } from "../Systems/Movement.js";

export const STEP = 1 / 60;
const MAX_FRAME = 0.25;

export function stepSim(state, dt) {
  if (state.outcome || state.awaitingLevelUp) return;
  const p = state.player;
  movePlayer(state, dt);
  if (state.stats.recovery > 0 && p.hp < p.maxHp) {
    p.hp = Math.min(p.maxHp, p.hp + state.stats.recovery * dt);
  }
  if (p.invuln > 0) p.invuln -= dt;
  if (p.hitFlash > 0) p.hitFlash -= dt;
  state.time += dt;
}

export function createLoop(update, render) {
  let last = 0;
  let acc = 0;
  let raf = 0;
  let running = false;

  function frame(nowMs) {
    if (!running) return;
    const now = nowMs / 1000;
    let dt = now - last;
    last = now;
    if (dt > MAX_FRAME) dt = MAX_FRAME;
    acc += dt;
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
  };
}
