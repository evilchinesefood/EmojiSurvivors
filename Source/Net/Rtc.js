// One WebRTC peer = two data channels: "ctrl" (ordered/reliable JSON — lobby,
// start, level-up/pause/end notices, string-table sync) and "snap" (unordered,
// no retransmit — binary state snapshots one way, tiny JSON inputs the other).
// Signaling payloads flow through the provided sendSignal callback.
//
// Handshake hardening (joins were intermittent without it):
// - ALL inbound signals run through one promise chain — a poll batch delivers
//   sdp+ice together, and addIceCandidate must never race setRemoteDescription.
// - ICE candidates arriving before the remote description are queued, then
//   flushed — dropping them silently can kill the only working route.
// - "disconnected" is transient (ICE route switching) — only "failed"/"closed"
//   are fatal, after a grace window.
const ICE = {
  iceServers: [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  ],
};

export function makePeer({
  initiator,
  sendSignal,
  onCtrl,
  onSnap,
  onOpen,
  onClose,
}) {
  const pc = new RTCPeerConnection(ICE);
  let ctrl = null;
  let snap = null;
  let opened = false;
  let closed = false;
  let haveRemote = false;
  const pendingIce = [];
  let chain = Promise.resolve(); // serializes every inbound signal
  let discTimer = 0;

  function maybeOpen() {
    if (
      !opened &&
      ctrl &&
      ctrl.readyState === "open" &&
      snap &&
      snap.readyState === "open"
    ) {
      opened = true;
      onOpen?.();
    }
  }
  function close() {
    if (closed) return;
    closed = true;
    clearTimeout(discTimer);
    try {
      pc.close();
    } catch {
      /* already gone */
    }
    onClose?.();
  }
  function wire(ch) {
    if (ch.label === "ctrl") {
      ctrl = ch;
      ch.onmessage = (e) => {
        try {
          onCtrl?.(JSON.parse(e.data));
        } catch {
          /* malformed — drop */
        }
      };
    } else {
      snap = ch;
      ch.binaryType = "arraybuffer";
      ch.onmessage = (e) => onSnap?.(e.data);
    }
    ch.onopen = maybeOpen;
    ch.onclose = close;
  }

  if (initiator) {
    wire(pc.createDataChannel("ctrl"));
    wire(pc.createDataChannel("snap", { ordered: false, maxRetransmits: 0 }));
  } else {
    pc.ondatachannel = (e) => wire(e.channel);
  }
  pc.onicecandidate = (e) => {
    if (e.candidate) sendSignal({ t: "ice", c: e.candidate.toJSON() });
  };
  pc.onconnectionstatechange = () => {
    const st = pc.connectionState;
    if (st === "failed" || st === "closed") close();
    else if (st === "disconnected") {
      clearTimeout(discTimer);
      discTimer = setTimeout(close, 6000); // grace — routes often recover
    } else if (st === "connected") clearTimeout(discTimer);
  };

  async function handleSignal(p) {
    if (closed) return;
    if (p.t === "sdp") {
      await pc.setRemoteDescription(p.d);
      haveRemote = true;
      while (pendingIce.length) {
        try {
          await pc.addIceCandidate(pendingIce.shift());
        } catch {
          /* stale candidate */
        }
      }
      if (p.d.type === "offer") {
        const a = await pc.createAnswer();
        await pc.setLocalDescription(a);
        const d = pc.localDescription;
        sendSignal({ t: "sdp", d: { type: d.type, sdp: d.sdp } });
      }
    } else if (p.t === "ice") {
      if (!haveRemote) pendingIce.push(p.c);
      else await pc.addIceCandidate(p.c);
    }
  }

  return {
    async start() {
      const o = await pc.createOffer();
      await pc.setLocalDescription(o);
      const d = pc.localDescription;
      sendSignal({ t: "sdp", d: { type: d.type, sdp: d.sdp } });
    },
    onSignal(p) {
      chain = chain.then(() => handleSignal(p)).catch(() => {});
    },
    sendCtrl(obj) {
      if (ctrl && ctrl.readyState === "open") ctrl.send(JSON.stringify(obj));
    },
    sendSnap(data) {
      if (snap && snap.readyState === "open" && snap.bufferedAmount < 262144)
        snap.send(data);
    },
    close,
    get open() {
      return opened;
    },
  };
}
