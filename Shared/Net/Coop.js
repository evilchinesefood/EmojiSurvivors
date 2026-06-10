// Co-op session orchestration (view-layer — the sim never imports this).
// HOST: owns the authoritative sim. Guests' inputs land in state.allies each
// step; ~20Hz binary snapshots + reliable ctrl notices go back out.
// GUEST: no sim — sends input, holds the last two snapshots, and serves an
// interpolated renderer-shaped "ghost" with locally-predicted self position.
import { signal, peerId } from "./Signal.js";
import { makePeer } from "./Rtc.js";
import {
  makeTables,
  tableAdd,
  packSnapshot,
  unpackSnapshot,
} from "./Protocol.js";
import { addAlly, removeAlly } from "../Engine/State.js";
import { allyLevelChoices, applyAllyChoice } from "../Systems/Leveling.js";
import { CHARACTERS, STARTER_ID } from "../Content/Characters.js";
import { WEAPONS } from "../Content/Weapons.js";

const MAX_GUESTS = 3; // 4 players total
const SNAP_MS = 50; // 20Hz
const INPUT_MS = 50;
const LERP_DELAY = 120;

export function makeCoop(version = "1") {
  const C = {
    mode: "off", // off | host | guest
    room: "",
    myName: "",
    myChar: STARTER_ID,
    error: "",
    started: false,
    // app callbacks
    onLobby: null,
    onStart: null, // guest: ({runLength, speed, slot})
    onEnd: null, // guest: ({victory, time, kills, level})
    onClose: null, // guest: (reason)
    onToast: null,
  };

  let tables = null;
  let poller = null;
  let lobby = []; // [{slot, name, char, host, connected}]

  // ── host side
  let guests = new Map(); // id -> {id, slot, name, char, peer, connected, ally, in, lastIn}
  let hostState = null;
  let lastSnapAt = 0;
  let lastBossName = "";
  let lastLevel = 1; // host level watermark — each gain deals every ally a hand
  let nextSlot = 1;

  // ── guest side
  let peer = null;
  let me = "";
  let mySlot = -1;
  let gConnected = false;
  let connectTimer = 0; // guest: bail out of a handshake that never completes
  let reapTimer = 0; // host: free slots held by joins that never connected
  let gHand = null; // guest: the upgrade hand currently offered by the host
  let gTray = null; // guest: own loadout summary [{e, l}] for the HUD tray
  let snapPrev = null; // {at, s}
  let snapCur = null;
  let pred = null; // predicted self {x, y, vx, vy}
  let runInfo = null;
  let lastInputAt = 0;
  let myWeaponId = null;
  let ghostObj = null;

  const toast = (m) => C.onToast?.(m);

  function rebuildLobby() {
    lobby = [
      {
        slot: 0,
        name: C.myName,
        char: C.myChar,
        host: true,
        connected: true,
      },
    ];
    for (const g of guests.values())
      lobby.push({
        slot: g.slot,
        name: g.name,
        char: g.char,
        host: false,
        connected: g.connected,
      });
    lobby.sort((a, b) => a.slot - b.slot);
    C.onLobby?.();
    broadcastCtrl({ t: "lobby", players: lobby });
  }

  function broadcastCtrl(obj) {
    for (const g of guests.values()) if (g.connected) g.peer.sendCtrl(obj);
  }

  function dropGuest(g, silent) {
    guests.delete(g.id);
    try {
      g.peer?.close();
    } catch {
      /* gone */
    }
    if (g.ally && hostState) removeAlly(hostState, g.id);
    if (!silent) {
      if (C.started) toast(`👋 ${g.name} left`);
      rebuildLobby();
    }
  }

  async function hostOpen(name, charId) {
    shutdown();
    C.mode = "host";
    C.myName = name;
    C.myChar = charId;
    C.error = "";
    tables = makeTables();
    const r = await signal.create().catch(() => null);
    if (!r || !r.ok) {
      C.error = "Could not create a room";
      C.mode = "off";
      C.onLobby?.();
      return;
    }
    C.room = r.room;
    poller = signal.makePoller(C.room, "host", (from, p) => {
      if (p.t === "hello") {
        if (guests.has(from)) return;
        if (p.v !== version) {
          signal.send(C.room, "host", from, {
            t: "reject",
            reason: "Different game version (2D vs 3D)",
          });
          return;
        }
        if (guests.size >= MAX_GUESTS || C.started) {
          // Tell them why — silence reads as "joining doesn't work".
          signal.send(C.room, "host", from, {
            t: "reject",
            reason: C.started ? "Game already started" : "Room is full",
          });
          return;
        }
        const g = {
          id: from,
          slot: nextSlot++,
          name: String(p.name || "Player")
            .replace(/[\x00-\x1f<>]/g, "")
            .slice(0, 16),
          char: CHARACTERS[p.char] ? p.char : STARTER_ID,
          connected: false,
          born: performance.now(),
          ally: null,
          in: null,
          lastIn: 0,
          peer: null,
        };
        g.peer = makePeer({
          initiator: true,
          sendSignal: (pp) => signal.send(C.room, "host", from, pp),
          onCtrl: (m) => {
            if (m.t === "char" && CHARACTERS[m.char] && !C.started) {
              g.char = m.char;
              rebuildLobby();
            } else if (m.t === "pick") {
              // Their upgrade pick — validate against the hand we dealt them.
              if (g.pendingHand && hostState && g.ally) {
                const c = g.pendingHand[m.i | 0];
                if (c) applyAllyChoice(hostState, g.ally, c);
                g.pendingHand = null;
                sendTray(g);
                maybeSendHand(g);
              }
            } else if (m.t === "bye") dropGuest(g);
          },
          onSnap: (d) => {
            if (typeof d === "string") {
              try {
                g.in = JSON.parse(d);
                g.lastIn = performance.now();
              } catch {
                /* drop */
              }
            }
          },
          onOpen: () => {
            g.connected = true;
            rebuildLobby();
          },
          onClose: () => dropGuest(g),
        });
        guests.set(from, g);
        g.peer.start();
        rebuildLobby();
      } else if ((p.t === "sdp" || p.t === "ice") && guests.has(from)) {
        guests.get(from).peer.onSignal(p);
      }
    });
    // Reap joins that never connect (failed handshake, double-click, closed
    // tab) — a zombie "JOINING…" entry would hold one of the 3 slots forever.
    reapTimer = setInterval(() => {
      for (const g of [...guests.values()])
        if (!g.connected && performance.now() - g.born > 25000) dropGuest(g);
    }, 5000);
    rebuildLobby();
  }

  // Called by Main right after startRun() built the host state.
  function hostAttach(state, runLength) {
    hostState = state;
    for (const g of [...guests.values()]) {
      if (!g.connected) {
        dropGuest(g, true);
        continue;
      }
      g.ally = addAlly(state, {
        id: g.id,
        name: g.name,
        character: CHARACTERS[g.char] || CHARACTERS[STARTER_ID],
      });
    }
    C.started = true;
    poller?.stop();
    poller = null;
    clearInterval(reapTimer);
    lastBossName = "";
    lastLevel = state.player.level; // Head Start can begin above 1
    for (const g of guests.values())
      g.peer.sendCtrl({
        t: "start",
        runLength,
        speed: state.stats.speed,
        slot: g.slot,
      });
  }

  // Pre-step: latest guest inputs -> ally inputs (stale input = stand still).
  function hostTick(state) {
    const now = performance.now();
    for (const g of guests.values()) {
      const a = g.ally;
      if (!a) continue;
      const fresh = g.in && now - g.lastIn < 1200;
      if (fresh) {
        const mx = +g.in.mx || 0;
        const my = +g.in.my || 0;
        const l = Math.hypot(mx, my);
        a.input.move.x = l > 1 ? mx / l : mx;
        a.input.move.y = l > 1 ? my / l : my;
        const ax = +g.in.ax || 0;
        const ay = +g.in.ay || 0;
        const al = Math.hypot(ax, ay);
        a.input.aim = al > 0.01 ? { x: ax / al, y: ay / al } : null;
        a.input.fire = !!g.in.f;
      } else {
        a.input.move.x = 0;
        a.input.move.y = 0;
        a.input.fire = false;
      }
    }
  }

  // Per-player upgrades: every host level gained deals each ally their own hand
  // (weapons-only) over ctrl; picks come back as {t:"pick"}. One hand in flight
  // per guest; an ignored hand auto-resolves to its first card once the queue
  // backs up, so an AFK guest can never stall their own progression.
  function sendTray(g) {
    if (!g.ally || !g.connected) return;
    g.peer.sendCtrl({
      t: "tray",
      w: g.ally.weapons.map((w) => ({
        e: WEAPONS[w.id]?.emoji || "❔",
        l: w.level,
      })),
    });
  }
  function maybeSendHand(g) {
    if (!g.ally || !g.connected || g.pendingHand || !(g.pickQueue > 0)) return;
    g.pickQueue--;
    g.pendingHand = allyLevelChoices(hostState, g.ally);
    g.peer.sendCtrl({
      t: "choices",
      hand: g.pendingHand.map((c) => ({
        k: c.kind,
        id: c.id || "",
        e: c.emoji,
        n: c.label,
        d: c.desc,
      })),
    });
  }

  // Post-step (throttled): string-table sync + snapshot broadcast + boss notice.
  function hostFlush(state) {
    const now = performance.now();
    if (now - lastSnapAt < SNAP_MS) return;
    lastSnapAt = now;
    if (state.player.level > lastLevel) {
      const delta = state.player.level - lastLevel;
      lastLevel = state.player.level;
      for (const g of guests.values()) {
        if (!g.ally || !g.connected) continue;
        g.pickQueue = (g.pickQueue || 0) + delta;
        if (g.pendingHand && g.pickQueue > 2) {
          applyAllyChoice(state, g.ally, g.pendingHand[0]); // AFK fallback
          g.pendingHand = null;
          sendTray(g);
        }
        maybeSendHand(g);
      }
    }
    let boss = null;
    for (const e of state.enemies)
      if (e.boss) {
        boss = e;
        break;
      }
    if (boss && boss.name !== lastBossName) {
      lastBossName = boss.name;
      broadcastCtrl({ t: "boss", name: boss.name });
    }
    const players = [
      {
        slot: 0,
        emoji: state.tainted ? "🤡" : state.character.emoji,
        unit: state.player,
        downed: false,
      },
    ];
    for (const g of guests.values())
      if (g.ally)
        players.push({
          slot: g.slot,
          emoji: g.ally.emoji,
          unit: g.ally,
          downed: g.ally.downed,
        });
    const buf = packSnapshot(state, tables, players);
    for (const m of tables.dirty.splice(0)) broadcastCtrl(m);
    for (const g of guests.values()) if (g.connected) g.peer.sendSnap(buf);
  }

  function hostNotify(obj) {
    if (C.mode === "host") broadcastCtrl(obj);
  }

  // ── guest side
  async function guestJoin(code, name, charId) {
    shutdown();
    C.mode = "guest";
    C.myName = name;
    C.myChar = charId;
    C.error = "";
    C.room = code.toUpperCase();
    me = peerId();
    const r = await signal.join(C.room).catch(() => null);
    if (!r || !r.ok) {
      C.error = "Room not found";
      C.mode = "off";
      C.onLobby?.();
      return;
    }
    tables = makeTables();
    gConnected = false;
    peer = makePeer({
      initiator: false,
      sendSignal: (p) => signal.send(C.room, me, "host", p),
      onCtrl: guestCtrl,
      onSnap: guestSnap,
      onOpen: () => {
        gConnected = true;
        clearTimeout(connectTimer);
        poller?.stop();
        poller = null;
        C.onLobby?.();
      },
      onClose: () => {
        clearTimeout(connectTimer);
        const inRun = C.mode === "guest" && C.started;
        const inLobby = C.mode === "guest" && !C.started;
        shutdown();
        if (inRun) C.onClose?.("Connection lost");
        else if (inLobby) {
          C.error = "Connection failed — try again";
          C.onLobby?.();
        }
      },
    });
    poller = signal.makePoller(C.room, me, (from, p) => {
      if (from !== "host") return;
      if (p.t === "sdp" || p.t === "ice") peer?.onSignal(p);
      else if (p.t === "reject") {
        clearTimeout(connectTimer);
        shutdown();
        C.error = p.reason || "Could not join";
        C.onLobby?.();
      }
    });
    // The hello must land (retried in signal.send); if the handshake still never
    // completes (host gone, hostile NAT), fail loud instead of waiting forever.
    const ok = await signal.send(C.room, me, "host", {
      t: "hello",
      name,
      char: charId,
      v: version,
    });
    if (!ok) {
      shutdown();
      C.error = "Could not reach the room — try again";
      C.onLobby?.();
      return;
    }
    connectTimer = setTimeout(() => {
      if (C.mode === "guest" && !gConnected) {
        shutdown();
        C.error = "Couldn't connect to the host — try again";
        C.onLobby?.();
      }
    }, 15000);
    C.onLobby?.();
  }

  function guestCtrl(m) {
    switch (m.t) {
      case "lobby":
        lobby = m.players || [];
        C.onLobby?.();
        break;
      case "tab":
        tableAdd(tables, m);
        break;
      case "start": {
        C.started = true;
        mySlot = m.slot;
        runInfo = { runLength: m.runLength, speed: m.speed };
        myWeaponId = (CHARACTERS[C.myChar] || CHARACTERS[STARTER_ID]).weapon;
        snapPrev = snapCur = null;
        pred = null;
        ghostObj = null;
        C.onStart?.(runInfo);
        break;
      }
      case "boss":
        lastBossName = String(m.name || "Boss");
        break;
      case "choices":
        gHand = Array.isArray(m.hand) ? m.hand.slice(0, 4) : null;
        C.onChoices?.();
        break;
      case "tray":
        gTray = Array.isArray(m.w) ? m.w.slice(0, 6) : null;
        break;
      case "lu":
        toast(m.open ? "⭐ Host is choosing an upgrade…" : "");
        break;
      case "pause":
        toast(m.open ? "⏸️ Host paused" : "");
        break;
      case "end":
        C.onEnd?.(m);
        break;
    }
  }

  function guestSnap(d) {
    if (typeof d === "string" || !(d instanceof ArrayBuffer)) return;
    const s = unpackSnapshot(d, tables);
    if (!s) return;
    snapPrev = snapCur;
    snapCur = { at: performance.now(), s };
    const meP = s.players.find((p) => p.slot === mySlot);
    if (meP && !meP.downed) {
      if (!pred) pred = { x: meP.x, y: meP.y, vx: 0, vy: 0 };
      else {
        // gentle reconcile toward the authoritative position; snap when way off
        const ex = meP.x - pred.x;
        const ey = meP.y - pred.y;
        if (ex * ex + ey * ey > 140 * 140) {
          pred.x = meP.x;
          pred.y = meP.y;
        } else {
          pred.x += ex * 0.12;
          pred.y += ey * 0.12;
        }
      }
    } else if (meP && meP.downed && pred) {
      pred.x = meP.x; // downed: camera rides the body until respawn
      pred.y = meP.y;
    }
  }

  function guestPredict(dt, intent) {
    if (!pred || !runInfo) return;
    const meP = snapCur?.s.players.find((p) => p.slot === mySlot);
    if (meP && meP.downed) return;
    pred.vx = intent.x * runInfo.speed;
    pred.vy = intent.y * runInfo.speed;
    pred.x += pred.vx * dt;
    pred.y += pred.vy * dt;
  }

  function guestInput(intent, aim, fire) {
    const now = performance.now();
    if (now - lastInputAt < INPUT_MS || !peer) return;
    lastInputAt = now;
    peer.sendSnap(
      JSON.stringify({
        t: "in",
        mx: +intent.x.toFixed(3),
        my: +intent.y.toFixed(3),
        ax: +aim.x.toFixed(3),
        ay: +aim.y.toFixed(3),
        f: fire ? 1 : 0,
      }),
    );
  }

  // Renderer/HUD-shaped view of the latest snapshots (interpolated).
  function ghost() {
    if (!snapCur) return null;
    const cur = snapCur.s;
    const prev = snapPrev?.s;
    let a = 1;
    if (prev && snapCur.at > snapPrev.at) {
      const rt = performance.now() - LERP_DELAY;
      a = Math.max(
        0,
        Math.min(1, (rt - snapPrev.at) / (snapCur.at - snapPrev.at)),
      );
    }
    const lerp = (x, y) => x + (y - x) * a;
    if (!ghostObj)
      ghostObj = {
        player: {
          weapons: [{ id: myWeaponId, level: 1, cd: 0 }],
          passives: {},
          invuln: 0,
          revivesUsed: 0,
          hitFlash: 0,
          magnetR: 0,
          pickupR: 0,
          facing: { x: 0, y: 1 },
        },
        // the 2D renderer draws the player's own emoji (3D never reads it)
        character: CHARACTERS[C.myChar] || CHARACTERS[STARTER_ID],
        stats: { speed: runInfo.speed },
        modifiers: { active: [] },
        modifierSel: {},
        endless: false,
        tainted: false,
        seasonal: {},
        cat: null,
        auditor: null,
        devil: 0,
        events: [],
        gems: [],
        coins: [],
        drops: [],
        auraViz: [],
        strikes: [],
      };
    const g = ghostObj;
    g.time = cur.time;
    const meCur = cur.players.find((p) => p.slot === mySlot);
    const mePrev = prev?.players.find((p) => p.slot === mySlot);
    const px = pred ? pred.x : meCur ? meCur.x : cur.hostX;
    const py = pred ? pred.y : meCur ? meCur.y : cur.hostY;
    g.player.x = px;
    g.player.y = py;
    g.player.vx = pred ? pred.vx : 0;
    g.player.vy = pred ? pred.vy : 0;
    g.player.hp = meCur ? meCur.hp : 0;
    g.player.maxHp = meCur ? meCur.maxHp : 100;
    g.player.level = cur.level;
    g.player.xp = cur.xp;
    g.player.xpNext = cur.xpNext;
    g.player.kills = cur.kills;
    g.player.coins = meCur ? meCur.coins : 0;
    g.downedSelf = !!meCur?.downed;
    g.respawnHint = g.downedSelf;
    if (mePrev) {
      /* self uses prediction; no lerp needed */
    }
    g.allies = [];
    for (const p of cur.players) {
      if (p.slot === mySlot) continue;
      const pp = prev?.players.find((q) => q.slot === p.slot);
      g.allies.push({
        x: pp ? lerp(pp.x, p.x) : p.x,
        y: pp ? lerp(pp.y, p.y) : p.y,
        emoji: p.emoji,
        downed: p.downed,
      });
    }
    // enemies: lerp by uid against the previous snapshot
    const prevByUid = new Map();
    if (prev) for (const e of prev.enemies) prevByUid.set(e.uid, e);
    g.enemies = cur.enemies.map((e) => {
      const pe = prevByUid.get(e.uid);
      return {
        x: pe ? lerp(pe.x, e.x) : e.x,
        y: pe ? lerp(pe.y, e.y) : e.y,
        emoji: e.emoji,
        size: e.size,
        boss: e.boss,
        name: e.boss ? lastBossName : undefined,
        hp: e.boss ? cur.bossHp : 1,
        maxHp: e.boss ? cur.bossMax || 1 : 1,
      };
    });
    g.projectiles = cur.projectiles;
    g.gems = cur.pickups;
    g.orbits = cur.orbits;
    g.hazards = cur.hazards;
    g.auraViz = cur.auras;
    return g;
  }

  function guestLeave() {
    peer?.sendCtrl({ t: "bye" });
    shutdown();
  }

  function shutdown() {
    poller?.stop();
    poller = null;
    clearTimeout(connectTimer);
    clearInterval(reapTimer);
    gConnected = false;
    for (const g of guests.values()) {
      try {
        g.peer?.close();
      } catch {
        /* gone */
      }
    }
    guests = new Map();
    try {
      peer?.close();
    } catch {
      /* gone */
    }
    peer = null;
    hostState = null;
    snapPrev = snapCur = null;
    pred = null;
    runInfo = null;
    ghostObj = null;
    gHand = null;
    gTray = null;
    lastLevel = 1;
    lobby = [];
    nextSlot = 1;
    mySlot = -1;
    C.mode = "off";
    C.started = false;
    C.room = "";
    C.error = "";
  }

  return Object.assign(C, {
    hostOpen,
    hostAttach,
    hostTick,
    hostFlush,
    hostNotify,
    guestJoin,
    guestPredict,
    guestInput,
    guestLeave,
    ghost,
    shutdown,
    setChar(id) {
      if (!CHARACTERS[id]) return;
      C.myChar = id;
      if (C.mode === "host") rebuildLobby();
      else peer?.sendCtrl({ t: "char", char: id });
    },
    players: () => lobby,
    isHost: () => C.mode === "host",
    isGuest: () => C.mode === "guest",
    isConnected: () => C.mode === "host" || gConnected,
    guestHand: () => gHand,
    guestPick(i) {
      if (!gHand) return;
      peer?.sendCtrl({ t: "pick", i });
      gHand = null;
      C.onChoices?.();
    },
    guestTray() {
      if (gTray)
        return gTray.map((t) => ({ emoji: t.e, level: t.l, evolved: false }));
      const wid = (CHARACTERS[C.myChar] || CHARACTERS[STARTER_ID]).weapon;
      return WEAPONS[wid]
        ? [{ emoji: WEAPONS[wid].emoji, level: 1, evolved: false }]
        : [];
    },
    connectedGuests: () =>
      [...guests.values()].filter((g) => g.connected).length,
    myCoins: () =>
      snapCur?.s.players.find((p) => p.slot === mySlot)?.coins || 0,
  });
}
