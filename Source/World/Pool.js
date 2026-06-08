// Generic object pool — recycle entity objects to cut GC churn at high counts.
// `reset` MUST clear every per-instance field on release (stale state from a reused
// slot is the classic pool bug). Active entities live in the sim's arrays; this only
// hands out / takes back the backing objects.
export function makePool(factory) {
  const free = [];
  return {
    acquire() {
      return free.length ? free.pop() : factory();
    },
    release(o) {
      free.push(o);
    },
    get size() {
      return free.length;
    },
  };
}
