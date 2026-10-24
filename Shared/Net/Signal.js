// Same-origin signaling client (Api/Signal.php): room create/join + a polled
// message mailbox, used only for the WebRTC handshake while a lobby is open.
const API = "/survivors/Api/Signal.php"; // shared across versions (rooms are version-gated)

const sessions = new Map();
const guests = new Map();
const joining = new Map();

async function post(body, token, keepalive = false) {
  const r = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
    keepalive,
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
    if (joining.has(room)) return joining.get(room);
    const request = (async () => {
      const prior = guests.get(room);
      let r = await post({ a: "join", room, v: 2 }, prior?.token);
      if (prior && r.error === "unauthorized") {
        sessions.delete(`${room}:${prior.peer}`);
        guests.delete(room);
        r = await post({ a: "join", room, v: 2 });
      }
      if (r.ok) {
        sessions.set(`${room}:${r.peer}`, r.token);
        guests.set(room, { peer: r.peer, token: r.token });
      }
      return r;
    })();
    joining.set(room, request);
    try { return await request; }
    finally { joining.delete(room); }
  },
  async confirm(room, peers) {
    const token = sessions.get(`${room}:host`);
    if (!token) return false;
    return post({ a: "confirm", room, peers }, token).then((r) => !!r.ok).catch(() => false);
  },
  async leave(room, peer) {
    const key = `${room}:${peer}`;
    const token = sessions.get(key);
    if (!token) return false;
    sessions.delete(key);
    if (guests.get(room)?.peer === peer) guests.delete(room);
    return post({ a: "leave", room, peer }, token, true).then((r) => !!r.ok).catch(() => false);
  },
  async release(room, peer) {
    const token = sessions.get(`${room}:host`);
    if (!token || peer === "host") return false;
    return post({ a: "leave", room, peer }, token, true).then((r) => !!r.ok).catch(() => false);
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
