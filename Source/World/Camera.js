// View-layer camera (not part of the sim). Centers on the player; converts between
// world and screen space; provides viewport-cull bounds in CSS pixels.
export function makeCamera() {
  return {
    x: 0,
    y: 0,
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
    toScreenX(wx) {
      return wx - this.x + this.w / 2;
    },
    toScreenY(wy) {
      return wy - this.y + this.h / 2;
    },
    toWorldX(sx) {
      return sx + this.x - this.w / 2;
    },
    toWorldY(sy) {
      return sy + this.y - this.h / 2;
    },
    inView(wx, wy, margin = 80) {
      const sx = wx - this.x + this.w / 2;
      const sy = wy - this.y + this.h / 2;
      return (
        sx >= -margin &&
        sx <= this.w + margin &&
        sy >= -margin &&
        sy <= this.h + margin
      );
    },
  };
}
