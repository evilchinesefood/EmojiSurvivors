import { h } from "./Dom.js";
import { icon } from "./Icons.js";
import { WEAPONS, scaleWeapon, MAX_WEAPON_LEVEL } from "../Content/Weapons.js";
import { PASSIVES } from "../Content/Passives.js";

function weaponRow(w, stats) {
  const def = WEAPONS[w.id];
  if (!def) return null;
  const sc = scaleWeapon(def, w.level);
  const dmg = Math.round(sc.damage * stats.might);
  const cd = def.cooldown
    ? (sc.interval / stats.cooldown).toFixed(2) + "s"
    : "—";
  let cur = dmg + " dmg · " + cd + (sc.count > 1 ? " · ×" + sc.count : "");
  let next = "";
  if (!def.evolved && w.level < MAX_WEAPON_LEVEL) {
    const n = scaleWeapon(def, w.level + 1);
    next =
      "→ L" +
      (w.level + 1) +
      ": " +
      Math.round(n.damage * stats.might) +
      " dmg";
  } else {
    next = "MAX";
  }
  return row(def.emoji, def.name, w.level, cur + "  " + next, def.evolved);
}

function passiveRow(id, lvl) {
  const pd = PASSIVES[id];
  if (!pd) return null;
  return row(
    pd.emoji,
    pd.name,
    lvl,
    pd.desc + (lvl >= pd.max ? "  (MAX)" : ""),
    false,
  );
}

function row(emoji, name, level, detail, evolved) {
  return h(
    "div",
    { class: "grid-row" },
    h("span", { class: "pick-emoji", style: "font-size:1.3rem" }, emoji),
    h(
      "div",
      { class: "col", style: "gap:0;flex:1;align-items:flex-start" },
      h(
        "strong",
        { class: evolved ? "gold" : "" },
        name + "  ",
        h("span", { class: "pick-tag" }, "L" + level),
      ),
      h("span", { class: "pick-tag" }, detail),
    ),
  );
}

export function PauseScreen(ctx) {
  const s = ctx.state;
  const rows = [];
  if (s) {
    for (const w of s.player.weapons) {
      const r = weaponRow(w, s.stats);
      if (r) rows.push(r);
    }
    for (const id in s.player.passives) {
      const r = passiveRow(id, s.player.passives[id]);
      if (r) rows.push(r);
    }
  }
  const loadout = rows.length
    ? h(
        "div",
        {
          class: "shop-grid",
          style:
            "grid-template-columns:1fr;width:min(440px,92vw);max-height:42vh;overflow-y:auto",
        },
        rows,
      )
    : null;

  const resume = h(
    "wa-button",
    { variant: "brand", size: "l" },
    icon("resume", { slot: "start" }),
    "Resume",
  );
  resume.addEventListener("click", () => ctx.onResume());
  const restart = h(
    "wa-button",
    { size: "l", appearance: "outlined" },
    icon("restart", { slot: "start" }),
    "Restart",
  );
  restart.addEventListener("click", () => ctx.onRestart());
  const quit = h(
    "wa-button",
    { size: "l", appearance: "outlined" },
    icon("quit", { slot: "start" }),
    "Quit",
  );
  quit.addEventListener("click", () => ctx.onQuit());

  return h(
    "div",
    { class: "screen screen-dim" },
    h(
      "div",
      { class: "title", style: "font-size:clamp(1.6rem,6vw,2.6rem)" },
      "Paused",
    ),
    loadout,
    h("div", { class: "menu-actions" }, resume, restart, quit),
  );
}
