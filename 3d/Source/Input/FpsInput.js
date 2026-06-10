// FPS input: pointer-lock mouse look + WASD strafing (camera-relative), a
// dual-zone touch fallback (left half = move stick, right drag = look, dedicated
// fire button), and gamepad support (left stick move, right stick look, RT/A
// fire, Start pause). View-layer only — Main samples getIntent()/getFire()/the
// camera each frame into the sim; update(dt) polls the pad once per fixed step.
const FWD = { KeyW: 1, ArrowUp: 1, KeyS: -1, ArrowDown: -1 };
const STR = { KeyD: 1, ArrowRight: 1, KeyA: -1, ArrowLeft: -1 };
const BASE_SENS = 0.0022;
const TOUCH_SENS = 0.0042;
const STICK_MAX = 64; // px of drag for full speed
const PAD_DEAD = 0.18;
const PAD_LOOK_X = 1250; // full right-stick deflection ≈ 2.75 rad/s at sens 1
const PAD_LOOK_Y = 900;

export function makeFpsInput({
  canvas,
  camera,
  isPlaying,
  onPause,
  sensitivity,
  fireBtn,
}) {
  const held = new Set();
  let stick = null; // {id, ox, oy, x, y} left-zone virtual stick
  let look = null; // {id, lx, ly} right-zone look drag
  let fireMouse = false;
  let fireTouch = false;
  let padFire = false;
  let padF = 0;
  let padS = 0;
  let prevStart = false;

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
    if (FWD[e.code] || STR[e.code]) {
      held.add(e.code);
      e.preventDefault();
    }
  });
  addEventListener("keyup", (e) => held.delete(e.code));
  const release = () => {
    held.clear();
    stick = null;
    look = null;
    fireMouse = false;
    fireTouch = false;
  };
  addEventListener("blur", release);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) release();
  });

  // Mouse look — movement deltas only exist while the pointer is locked.
  addEventListener("mousemove", (e) => {
    if (document.pointerLockElement !== canvas || !isPlaying()) return;
    camera.rotate(e.movementX, e.movementY, BASE_SENS * sensitivity());
  });

  // Mouse trigger: LMB fires only while locked (an unlocked click is the
  // re-lock gesture, not a shot).
  addEventListener("mousedown", (e) => {
    if (e.button === 0 && document.pointerLockElement === canvas)
      fireMouse = true;
  });
  addEventListener("mouseup", (e) => {
    if (e.button === 0) fireMouse = false;
  });

  // Touch: left zone steers a virtual stick, right zone drags the view, and the
  // on-screen button (its own element, so it wins the pointer) fires.
  canvas.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" || !isPlaying()) return;
    canvas.setPointerCapture?.(e.pointerId);
    if (e.clientX < innerWidth * 0.45 && !stick)
      stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0 };
    else if (!look) look = { id: e.pointerId, lx: e.clientX, ly: e.clientY };
  });
  canvas.addEventListener("pointermove", (e) => {
    if (stick && e.pointerId === stick.id) {
      stick.x = e.clientX - stick.ox;
      stick.y = e.clientY - stick.oy;
    } else if (look && e.pointerId === look.id) {
      camera.rotate(
        e.clientX - look.lx,
        e.clientY - look.ly,
        TOUCH_SENS * sensitivity(),
      );
      look.lx = e.clientX;
      look.ly = e.clientY;
    }
  });
  const drop = (e) => {
    if (stick && e.pointerId === stick.id) stick = null;
    if (look && e.pointerId === look.id) look = null;
  };
  canvas.addEventListener("pointerup", drop);
  canvas.addEventListener("pointercancel", drop);
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  if (fireBtn) {
    fireBtn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      fireBtn.setPointerCapture?.(e.pointerId);
      fireTouch = true;
    });
    const off = () => (fireTouch = false);
    fireBtn.addEventListener("pointerup", off);
    fireBtn.addEventListener("pointercancel", off);
  }

  // Gamepad: polled once per fixed step (needs dt for stick-look rate). Runs in
  // every machine state so Start can pause AND resume.
  function update(dt) {
    padF = 0;
    padS = 0;
    padFire = false;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let p = null;
    for (const g of pads)
      if (g && g.connected) {
        p = g;
        break;
      }
    if (!p) {
      prevStart = false;
      return;
    }
    const dz = (v) => (Math.abs(v) > PAD_DEAD ? v : 0);
    padF = -dz(p.axes[1] || 0);
    padS = dz(p.axes[0] || 0);
    if (isPlaying()) {
      const rx = dz(p.axes[2] || 0);
      const ry = dz(p.axes[3] || 0);
      if (rx || ry)
        camera.rotate(
          rx * PAD_LOOK_X * dt,
          ry * PAD_LOOK_Y * dt,
          BASE_SENS * sensitivity(),
        );
    }
    padFire =
      (p.buttons[7] && p.buttons[7].value > 0.35) ||
      (p.buttons[0] && p.buttons[0].pressed);
    const start = !!(p.buttons[9] && p.buttons[9].pressed);
    if (start && !prevStart) onPause?.();
    prevStart = start;
  }

  // Camera-relative movement intent on the sim plane.
  function getIntent(cam) {
    let f = 0;
    let s = 0;
    for (const code of held) {
      f += FWD[code] || 0;
      s += STR[code] || 0;
    }
    if (!f && !s && stick) {
      const l = Math.hypot(stick.x, stick.y);
      if (l > 8) {
        const m = Math.min(1, l / STICK_MAX);
        f = (-stick.y / l) * m;
        s = (stick.x / l) * m;
      }
    }
    if (!f && !s && (padF || padS)) {
      f = padF;
      s = padS;
    }
    if (!f && !s) return { x: 0, y: 0 };
    const fwd = cam.planeForward();
    const rgt = cam.planeRight();
    const x = fwd.x * f + rgt.x * s;
    const y = fwd.y * f + rgt.y * s;
    const l = Math.hypot(x, y) || 1;
    const m = Math.min(1, Math.hypot(f, s));
    return { x: (x / l) * m, y: (y / l) * m };
  }

  function getFire() {
    return fireMouse || fireTouch || padFire;
  }

  function lock() {
    if (document.pointerLockElement === canvas) return;
    try {
      const p = canvas.requestPointerLock?.({ unadjustedMovement: true });
      // Some browsers reject the options object — retry plain.
      if (p && p.catch)
        p.catch(() => {
          try {
            canvas.requestPointerLock();
          } catch {
            /* touch device / denied — touch controls still work */
          }
        });
    } catch {
      try {
        canvas.requestPointerLock?.();
      } catch {
        /* unavailable */
      }
    }
  }

  function unlock() {
    if (document.pointerLockElement === canvas) document.exitPointerLock?.();
  }

  // Browser-forced unlock (Esc) while playing → treat as pause.
  document.addEventListener("pointerlockchange", () => {
    if (document.pointerLockElement !== canvas && isPlaying()) onPause?.();
  });

  return { getIntent, getFire, update, lock, unlock, release };
}
