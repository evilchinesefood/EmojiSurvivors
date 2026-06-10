// Keyboard (WASD/arrows) + pointer/touch follow → a normalized movement intent.
// View-layer: reads DOM events, writes nothing to the sim directly — Main samples
// getIntent() each frame into state.input.move. Pointer-follow walks the player
// toward the held pointer/finger (character-relative, so it works on mobile).
const KEYS = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  KeyW: [0, -1],
  KeyS: [0, 1],
  KeyA: [-1, 0],
  KeyD: [1, 0],
};

export function makeInput({ canvas, isPlaying, onPause }) {
  const held = new Set();
  let pointer = null; // {x, y} in CSS px, while down
  let hover = null; // {x, y} latest cursor pos (desktop), for manual aim

  // True while the user is typing in a form control (e.g. the leaderboard-name
  // field) — movement/pause keys must reach the field, not the game, and must NOT be
  // preventDefault'd (that swallowed W/A/S/D/arrows in text inputs).
  const typing = (e) => {
    const t = e.target;
    return (
      t &&
      (t.isContentEditable ||
        t.tagName === "INPUT" ||
        t.tagName === "TEXTAREA" ||
        t.tagName === "SELECT")
    );
  };

  addEventListener("keydown", (e) => {
    if (e.repeat || typing(e)) return;
    if (e.code === "Escape" || e.code === "KeyP") {
      onPause?.();
      return;
    }
    if (KEYS[e.code]) {
      held.add(e.code);
      e.preventDefault();
    }
  });
  addEventListener("keyup", (e) => held.delete(e.code));
  const release = () => {
    held.clear();
    pointer = null;
    hover = null;
  };
  addEventListener("blur", release);
  // Backgrounding mid-press (notification, app switch) can drop the pointerup — clear
  // so the player doesn't keep walking toward a stale point on resume.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) release();
  });

  const setPointer = (e) => {
    if (!isPlaying()) return;
    const r = canvas.getBoundingClientRect();
    pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  canvas.addEventListener("pointerdown", (e) => {
    setPointer(e);
    canvas.setPointerCapture?.(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (pointer) setPointer(e);
    if (!isPlaying()) return; // don't track a stale cursor for aim outside a run
    const r = canvas.getBoundingClientRect();
    hover = { x: e.clientX - r.left, y: e.clientY - r.top };
  });
  const drop = () => (pointer = null);
  canvas.addEventListener("pointerup", drop);
  canvas.addEventListener("pointercancel", drop);
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  function getIntent(camera, player) {
    let x = 0;
    let y = 0;
    for (const code of held) {
      x += KEYS[code][0];
      y += KEYS[code][1];
    }
    if (x || y) {
      const l = Math.hypot(x, y);
      return { x: x / l, y: y / l };
    }
    if (pointer) {
      const wx = camera.toWorldX(pointer.x);
      const wy = camera.toWorldY(pointer.y);
      const dx = wx - player.x;
      const dy = wy - player.y;
      const d = Math.hypot(dx, dy);
      if (d > 6) return { x: dx / d, y: dy / d };
    }
    return { x: 0, y: 0 };
  }

  // Manual aim: direction from player to the cursor (desktop hover) or held finger.
  function getAim(camera, player) {
    const src = hover || pointer;
    if (!src) return null;
    const dx = camera.toWorldX(src.x) - player.x;
    const dy = camera.toWorldY(src.y) - player.y;
    const d = Math.hypot(dx, dy);
    if (d < 4) return null;
    return { x: dx / d, y: dy / d };
  }

  return {
    getIntent,
    getAim,
    clear: () => {
      pointer = null;
      hover = null;
    },
  };
}
