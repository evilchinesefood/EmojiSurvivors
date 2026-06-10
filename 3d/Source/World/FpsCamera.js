// First-person view camera (not part of the sim). Tracks the player's plane
// position plus mouse-look yaw/pitch. Sim plane (x, y) maps to 3D (x, h, z=y);
// yaw 0 faces sim "north" (0, -1). The renderer reads yaw/pitch/eye directly.
const PITCH_MAX = 1.25; // ~72° — keeps the horizon (and the swarm) in play

export function makeFpsCamera() {
  return {
    x: 0,
    y: 0, // sim-plane position (mirrors the player)
    yaw: 0,
    pitch: 0,
    eye: 46,
    w: 0,
    h: 0,
    resize(w, h) {
      this.w = w;
      this.h = h;
    },
    follow(px, py) {
      this.x = px;
      this.y = py;
    },
    reset() {
      this.yaw = 0;
      this.pitch = 0;
    },
    rotate(dx, dy, sens) {
      this.yaw -= dx * sens;
      this.pitch = Math.max(
        -PITCH_MAX,
        Math.min(PITCH_MAX, this.pitch - dy * sens),
      );
    },
    // Look direction projected onto the sim plane (weapons fire where you look).
    planeForward() {
      return { x: -Math.sin(this.yaw), y: -Math.cos(this.yaw) };
    },
    planeRight() {
      return { x: Math.cos(this.yaw), y: -Math.sin(this.yaw) };
    },
  };
}
