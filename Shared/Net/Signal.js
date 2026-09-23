// Same-origin signaling client (Api/Signal.php): room create/join + a polled
// message mailbox, used only for the WebRTC handshake while a lobby is open.
const API = "/survivors/Api/Signal.php"; // shared across versions (rooms are version-gated)

const sessions = new Map();

async function post(body, token) {
  const r = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  return r.json();
}

export const signal = {
  async create() {
    const r = await post({ a: "create", v: 2 });
    if (r.ok) sessions.set(`${r.room}:${r.peer}`, r.token);
    return r;
  },
  async join(room) {
    const r = await post({ a: "join", room, v: 2 });
    if (r.ok) sessions.set(`${room}:${r.peer}`, r.token);
    return r;
  },
  // Handshake messages MUST land — a silently dropped SDP offer/answer kills the
  // join forever. Retry through transient 503s (store lock contention) / blips.
  async send(room, from, to, p) {
    for (let i = 0; i < 4; i++) {
      try {
        const token = sessions.get(`${room}:${from}`);
        if (!token) return false;
        const r = await post({ a: "msg", room, from, to, p }, token);
        if (r && r.ok) return true;
        if (r && ["no room", "unauthorized"].includes(r.error)) return false; // dead room — stop
      } catch {
        /* network blip — retry */
      }
      await new Promise((res) => setTimeout(res, 200 * (i + 1)));
    }
    return false;
  },
  // Polls every 700ms until stopped; delivers (from, payload) per message.
  makePoller(room, me, onMsg) {
    let cursor = 0;
    let timer = 0;
    let stopped = false;
    async function tick() {
      if (stopped) return;
      try {
        const r = await fetch(
          API +
            "?a=poll&room=" +
            encodeURIComponent(room) +
            "&for=" +
            encodeURIComponent(me) +
            "&after=" +
            cursor,
          { headers: { Authorization: `Bearer ${sessions.get(`${room}:${me}`) || ""}` } },
        ).then((x) => x.json());
        if (["unauthorized", "no room"].includes(r.error)) { stopped = true; return; }
        if (r.ok) {
          cursor = r.cursor;
          for (const m of r.msgs) onMsg(m.from, m.p);
        }
      } catch {
        /* transient network blip — next poll retries */
      }
      if (!stopped) timer = setTimeout(tick, 700);
    }
    tick();
    return {
      stop() {
        stopped = true;
        clearTimeout(timer);
      },
    };
  },
};

export function peerId() {
  const a = "abcdefghjkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 10; i++) s += a[(Math.random() * a.length) | 0];
  return s;
}
