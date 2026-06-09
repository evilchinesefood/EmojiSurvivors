import { h } from "./Dom.js";
import { icon } from "./Icons.js";

function mmss(sec) {
  const s = Math.max(0, Math.floor(sec));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}

export function ResultScreen(ctx) {
  const r = ctx.summary;
  const won = ctx.victory;

  const title = h(
    "div",
    { class: "title", style: "font-size:clamp(1.8rem,7vw,3rem)" },
    won ? icon("trophy") : icon("skull"),
    won ? " Victory!" : " You Died",
  );
  const sub = h(
    "div",
    { class: "subtitle" },
    won ? "you survived the night" : "the swarm got you",
  );

  const charLine = r.character
    ? h(
        "div",
        { class: "row", style: "gap:0.4rem" },
        h(
          "span",
          { class: "pick-emoji", style: "font-size:1.8rem" },
          r.character.emoji,
        ),
        h("strong", {}, r.character.name),
      )
    : null;

  const pill = (it) =>
    h(
      "div",
      { class: "tray-item" + (it.evolved ? " evolved" : "") },
      it.emoji || "❔",
      h("span", { class: "tray-lvl" }, String(it.level)),
    );
  const loadout = h(
    "div",
    { class: "hud-tray", style: "margin:0;max-width:min(560px,92vw)" },
    (r.weapons || []).map(pill),
    (r.passives || []).map(pill),
  );

  const rows = [
    ["timer", "Time", mmss(r.time)],
    ["kills", "Kills", String(r.kills)],
    ["level", "Level", String(r.level)],
    ["swords", "Est. DPS", String(r.dps ?? "—")],
    ["coin", "Coins earned", "+" + r.coins],
  ];
  const summary = h(
    "div",
    { class: "summary" },
    rows.flatMap(([ic, k, v]) => [
      h("div", { class: "k" }, icon(ic), " " + k),
      h("div", { class: "v" }, v),
    ]),
  );

  const shop = h(
    "wa-button",
    { variant: "brand", size: "l" },
    icon("shop", { slot: "start" }),
    "Shop",
  );
  shop.addEventListener("click", () => ctx.onShop());
  const retry = h(
    "wa-button",
    { size: "l", appearance: "outlined" },
    icon("restart", { slot: "start" }),
    "Retry",
  );
  retry.addEventListener("click", () => ctx.onRetry());
  const menu = h(
    "wa-button",
    { size: "l", appearance: "outlined" },
    icon("quit", { slot: "start" }),
    "Menu",
  );
  menu.addEventListener("click", () => ctx.onMenu());

  return h(
    "div",
    { class: "screen" },
    title,
    sub,
    charLine,
    loadout,
    summary,
    h("div", { class: "menu-actions" }, shop, retry, menu),
  );
}
