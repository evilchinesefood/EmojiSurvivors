// In-run HUD over the canvas. Persistent nodes built once; update() mutates their
// values each frame (no per-frame DOM churn). The icon tray rebuilds only when the
// loadout signature changes. FA icons (chrome); the tray shows weapon/passive emoji.
import { h, clear } from "./Dom.js";
import { icon } from "./Icons.js";

function mmss(sec) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  return m + ":" + String(s % 60).padStart(2, "0");
}

export function makeHud(root, { onPause }) {
  const timerEl = h("span", { class: "hud-timer" }, "0:00");
  const levelEl = h("span", {}, "1");
  const coinEl = h("span", {}, "0");
  const top = h(
    "div",
    { class: "hud-top" },
    h("span", { class: "hud-stat" }, icon("timer"), timerEl),
    h("span", { class: "hud-stat" }, icon("level"), levelEl),
    h("span", { class: "hud-stat" }, icon("coin"), coinEl),
  );

  const hpFill = h("div", { class: "bar-fill" });
  const hpLabel = h("div", { class: "bar-label" }, "");
  const xpFill = h("div", { class: "bar-fill" });
  const bars = h(
    "div",
    { class: "hud-bars" },
    h("div", { class: "bar bar-hp" }, hpFill, hpLabel),
    h("div", { class: "bar bar-xp" }, xpFill),
  );

  const tray = h("div", { class: "hud-tray" });
  const pauseBtn = h(
    "button",
    { class: "hud-pause", "aria-label": "Pause" },
    icon("pause"),
  );
  pauseBtn.addEventListener("click", () => onPause?.());

  clear(root);
  root.append(top, bars, tray, pauseBtn);

  let traySig = "";

  function update(state, trayItems) {
    const p = state.player;
    timerEl.textContent = mmss(state.time);
    levelEl.textContent = String(p.level);
    coinEl.textContent = String(p.coins);
    const hpPct = Math.max(0, Math.min(1, p.hp / p.maxHp));
    hpFill.style.transform = "scaleX(" + hpPct + ")";
    hpLabel.textContent = Math.ceil(p.hp) + " / " + p.maxHp;
    const xpPct = Math.max(0, Math.min(1, p.xp / p.xpNext));
    xpFill.style.transform = "scaleX(" + xpPct + ")";

    const sig = trayItems
      .map((i) => i.emoji + i.level + (i.evolved ? "*" : ""))
      .join("|");
    if (sig !== traySig) {
      traySig = sig;
      clear(tray);
      for (const it of trayItems) {
        tray.appendChild(
          h(
            "div",
            { class: "tray-item" + (it.evolved ? " evolved" : "") },
            it.emoji,
            h("span", { class: "tray-lvl" }, String(it.level)),
          ),
        );
      }
    }
  }

  return {
    root,
    update,
    show() {
      root.hidden = false;
    },
    hide() {
      root.hidden = true;
    },
  };
}
