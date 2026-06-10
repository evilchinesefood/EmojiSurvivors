// Co-op lobby: host opens a 4-letter room, up to 3 guests join by code; everyone
// picks a character inline; the host picks the run length and starts. Re-rendered
// whole by the shell whenever the lobby changes (coop.onLobby -> refresh).
import { h } from "./Dom.js";
import { icon } from "./Icons.js";
import { CHARACTERS } from "../Content/Characters.js";

const LENGTHS = [
  [300, "5 min"],
  [600, "10 min"],
  [900, "15 min"],
  [1800, "30 min"],
];

function charPicker(meta, coop) {
  const row = h("div", { class: "row", style: "max-width:560px" });
  for (const id in CHARACTERS) {
    const c = CHARACTERS[id];
    if (!meta.isCharUnlocked(c)) continue;
    const b = h(
      "button",
      {
        class: "coop-char" + (coop.myChar === id ? " sel" : ""),
        title: c.name,
        "aria-label": c.name,
      },
      c.emoji,
    );
    b.addEventListener("click", () => coop.setChar(id));
    row.appendChild(b);
  }
  return row;
}

function playerRows(coop) {
  const col = h("div", { class: "col", style: "min-width:300px" });
  const players = coop.players();
  for (const p of players) {
    col.appendChild(
      h(
        "div",
        { class: "grid-row" },
        h("span", {}, CHARACTERS[p.char]?.emoji || "🙂"),
        h("span", { class: "gr-name" }, p.name || "Player"),
        h(
          "span",
          { class: "pick-tag" },
          p.host ? "HOST" : p.connected ? "READY" : "JOINING…",
        ),
      ),
    );
  }
  for (let i = players.length; i < 4; i++)
    col.appendChild(
      h(
        "div",
        { class: "grid-row", style: "opacity:.45" },
        h("span", {}, "💤"),
        h("span", { class: "gr-name" }, "open slot"),
      ),
    );
  return col;
}

export function CoopScreen(ctx) {
  const { coop, meta } = ctx;
  const title = h(
    "div",
    { class: "title", style: "font-size:clamp(1.4rem,5vw,2.2rem)" },
    "Co-op",
  );
  const back = h(
    "wa-button",
    { appearance: "outlined", size: "m" },
    icon("back", { slot: "start" }),
    "Leave",
  );
  back.addEventListener("click", () => {
    if (coop.isGuest()) coop.guestLeave();
    else coop.shutdown();
    ctx.onBack();
  });

  // ── pre-lobby: host or join
  if (coop.mode === "off") {
    const host = h(
      "wa-button",
      { variant: "brand", size: "l" },
      "🏰 Host Game",
    );
    host.addEventListener("click", async () => {
      host.disabled = true; // double-clicks spawn zombie sessions
      await coop.hostOpen(meta.playerName || "Host", coop.myChar);
      ctx.refresh();
    });
    const code = h("input", {
      type: "text",
      class: "es-text coop-code",
      maxlength: "4",
      placeholder: "CODE",
      "aria-label": "Room code",
    });
    const join = h("wa-button", { appearance: "outlined", size: "l" }, "Join");
    join.addEventListener("click", async () => {
      const v = code.value.trim().toUpperCase();
      if (v.length !== 4) return;
      join.disabled = true; // a re-click mid-handshake kills the first attempt
      await coop.guestJoin(v, meta.playerName || "Guest", coop.myChar);
      ctx.refresh();
    });
    return h(
      "div",
      { class: "screen" },
      title,
      h("div", { class: "subtitle" }, "survive the swarm together — up to 4"),
      h("div", { class: "menu-actions" }, host),
      h("div", { class: "row" }, code, join),
      coop.error ? h("div", { class: "coop-err" }, coop.error) : null,
      back,
    );
  }

  // ── lobby (host or guest)
  const isHost = coop.isHost();
  const codeEl = coop.room
    ? h(
        "div",
        { class: "coop-roomcode" },
        h("span", { class: "subtitle" }, "room code"),
        h("div", { class: "coop-code-big" }, coop.room),
      )
    : null;

  let lenSeg = null;
  let startBtn = null;
  if (isHost) {
    let runLength = ctx.runLength.value;
    lenSeg = h("div", { class: "seg" });
    for (const [len, label] of LENGTHS) {
      const b = h(
        "wa-button",
        {
          size: "s",
          appearance: len === runLength ? "filled" : "outlined",
        },
        label,
      );
      b.addEventListener("click", () => {
        ctx.runLength.value = len;
        ctx.refresh();
      });
      lenSeg.appendChild(b);
    }
    startBtn = h(
      "wa-button",
      { variant: "brand", size: "l" },
      icon("play", { slot: "start" }),
      coop.connectedGuests() ? "Start Run" : "Waiting for players…",
    );
    startBtn.addEventListener("click", () => ctx.onStart(ctx.runLength.value));
  }

  return h(
    "div",
    { class: "screen" },
    title,
    codeEl,
    playerRows(coop),
    h("div", { class: "subtitle" }, "your character"),
    charPicker(meta, coop),
    lenSeg,
    isHost
      ? startBtn
      : h(
          "div",
          { class: "subtitle" },
          coop.isConnected()
            ? "waiting for the host to start…"
            : "connecting to host…",
        ),
    back,
  );
}

// Minimal pause for guests: the host's sim keeps running, so this is just an
// overlay with a way out — not a real pause.
export function GuestPauseScreen({ onResume, onLeave }) {
  const res = h("wa-button", { variant: "brand", size: "l" }, "Resume");
  res.addEventListener("click", onResume);
  const leave = h(
    "wa-button",
    { appearance: "outlined", size: "l" },
    "Leave Run",
  );
  leave.addEventListener("click", onLeave);
  return h(
    "div",
    { class: "screen screen-dim" },
    h(
      "div",
      { class: "title", style: "font-size:clamp(1.2rem,4vw,1.8rem)" },
      "Paused (for you)",
    ),
    h("div", { class: "subtitle" }, "the run keeps going without you"),
    h("div", { class: "menu-actions" }, res, leave),
  );
}
