// Same-origin signaling client (Api/Signal.php): room create/join + a polled
// message mailbox, used only for the WebRTC handshake while a lobby is open.
const API = "Api/Signal.php";

async function post(body) {
  const r = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

export const signal = {
  create: () => post({ a: "create" }),
  join: (room) => post({ a: "join", room }),
  // Handshake messages MUST land — a silently dropped SDP offer/answer kills the
  // join forever. Retry through transient 503s (store lock contention) / blips.
  async send(room, from, to, p) {
    for (let i = 0; i < 4; i++) {
      try {
        const r = await post({ a: "msg", room, from, to, p });
        if (r && r.ok) return true;
        if (r && r.error === "no room") return false; // dead room — stop
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
        ).then((x) => x.json());
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
