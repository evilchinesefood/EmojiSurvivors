// Online leaderboard client. Same-origin PHP endpoint (Api/Leaderboard.php);
// everything is best-effort — offline / file:// dev simply no-ops. Tainted saves
// never post: the circus stays local.
const API = "Api/Leaderboard.php";
// Rotated 2026-06-10. NOTE: this salt necessarily ships in the client (the browser
// must produce a matching signature), so it is a forgery speed-bump, not a secret —
// the real guards live server-side (sanity caps + per-IP rate limit). Must stay
// byte-identical to the SALT in Api/Leaderboard.php.
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

// Fire-and-forget; callers never await this on the critical path. A hard timeout keeps
// a hung server from leaking a pending request/connection per submit.
export async function postRun(entry, name) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 6000);
  try {
    await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entry, name: name || "", sig: entrySig(entry) }),
      signal: c.signal,
    });
  } catch {
    /* offline / no PHP / timeout — fine */
  } finally {
    clearTimeout(t);
  }
}

export async function fetchBoard(key) {
  // Hard timeout (covers the body read too): a hung/slow server returns null instead of
  // pinning the Records "summoning…" state forever. RecordsScreen renders null as offline.
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 8000);
  try {
    const r = await fetch(API + "?board=" + encodeURIComponent(key), {
      cache: "no-store",
      signal: c.signal,
    });
    if (!r.ok) return null;
    const j = await r.json();
    return Array.isArray(j.entries) ? j.entries : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
