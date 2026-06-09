// Uniform-grid spatial hash — the collision perf backbone. Rebuilt each step from
// the enemy list; projectiles/strikes query only the cells overlapping their
// circle. Keeps 1000+ entities cheap by never doing O(n²) scans.
export function makeSpatialHash(cell = 72) {
  const buckets = new Map();
  // Pack a signed cell-coord pair into one non-negative integer key — avoids the
  // per-insert + per-queried-cell string allocation that dominated GC under swarms.
  // ±32768 cells × 72px ≈ ±2.3M world units of headroom (ample for a run).
  const ck = (cx, cy) => (cx + 32768) * 65536 + (cy + 32768);

  return {
    cell,
    clear() {
      buckets.clear();
    },
    insert(item) {
      const k = ck(Math.floor(item.x / cell), Math.floor(item.y / cell));
      const a = buckets.get(k);
      if (a) a.push(item);
      else buckets.set(k, [item]);
    },
    // Collect items whose cell overlaps the circle bbox into `out` (reused array).
    queryCircle(x, y, r, out) {
      out.length = 0;
      const minx = Math.floor((x - r) / cell);
      const maxx = Math.floor((x + r) / cell);
      const miny = Math.floor((y - r) / cell);
      const maxy = Math.floor((y + r) / cell);
      for (let cx = minx; cx <= maxx; cx++) {
        for (let cy = miny; cy <= maxy; cy++) {
          const a = buckets.get(ck(cx, cy));
          if (a) for (let i = 0; i < a.length; i++) out.push(a[i]);
        }
      }
      return out;
    },
  };
}
