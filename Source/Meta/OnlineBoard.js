// Online leaderboard client. Same-origin PHP endpoint (Api/Leaderboard.php);
// everything is best-effort — offline / file:// dev simply no-ops. Tainted saves
// never post: the circus stays local.
const API = "Api/Leaderboard.php";
const SALT = "es-ldr-2026-9f3a7c2e-spectral-tally";

// FNV-1a 32-bit over an ASCII-only canonical string (charCodeAt == bytes, so the
// PHP side can mirror it exactly). A deterrent, not security.
function fnv(s) {
  let h = 0x811c9dc5;
  const t = s + SALT;
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

export function entrySig(e) {
  return fnv(
    [
      e.runLength,
      e.endless ? 1 : 0,
      e.hard ? 1 : 0,
      e.won ? 1 : 0,
      e.score,
      e.time,
      e.kills,
      e.level,
      e.character,
    ].join("|"),
  );
}

// Fire-and-forget; callers never await this on the critical path.
export async function postRun(entry, name) {
  try {
    await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entry, name: name || "", sig: entrySig(entry) }),
    });
  } catch {
    /* offline / no PHP — fine */
  }
}

export async function fetchBoard(key) {
  try {
    const r = await fetch(API + "?board=" + encodeURIComponent(key), {
      cache: "no-store",
    });
    if (!r.ok) return null;
    const j = await r.json();
    return Array.isArray(j.entries) ? j.entries : null;
  } catch {
    return null;
  }
}
