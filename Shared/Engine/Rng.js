// Seeded PRNG (mulberry32). Each stream owns its state so spawns, level-up rolls,
// and combat draws stay independent and reproducible for the headless probe.
export function makeRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    float: (lo, hi) => lo + (hi - lo) * next(),
    int: (n) => Math.floor(next() * n), // [0, n)
    range: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)), // inclusive ints
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
    angle: () => next() * Math.PI * 2,
    get state() {
      return a >>> 0;
    },
  };
}

// Cheap deterministic mix so derived streams don't correlate with the base seed.
export function mixSeed(seed, salt) {
  let h = (seed ^ salt) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
