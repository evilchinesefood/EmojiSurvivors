import { h } from "./Dom.js";
import { icon } from "./Icons.js";
import { MOD_DEFS } from "../Content/Modifiers.js";

function mmss(sec) {
  const s = Math.max(0, Math.floor(sec));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}

export function ResultScreen(ctx) {
  const r = ctx.summary;
  const won = ctx.victory;
  const endless = !!r.endless;

  const title = h(
    "div",
    { class: "title", style: "font-size:clamp(1.8rem,7vw,3rem)" },
    endless ? "♾️" : won ? icon("trophy") : icon("skull"),
    endless ? " Endless" : won ? " Victory!" : " You Died",
  );
  const sub = h(
    "div",
    { class: "subtitle" },
    endless
      ? "score " +
          r.score +
          (r.score >= r.bestScore ? " — new best!" : " · best " + r.bestScore)
      : won
        ? "you survived the night"
        : "the swarm got you",
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
  if (endless) rows.unshift(["records", "Score", String(r.score)]);
  const summary = h(
    "div",
    { class: "summary" },
    rows.flatMap(([ic, k, v]) => [
      h("div", { class: "k" }, icon(ic), " " + k),
      h("div", { class: "v" }, v),
    ]),
  );

  const mods =
    r.modifiers && r.modifiers.length
      ? h(
          "div",
          { class: "row", style: "gap:.3rem;flex-wrap:wrap;max-width:92vw" },
          r.modifiers.map((id) =>
            h(
              "span",
              { class: "pick-tag" },
              MOD_DEFS[id] ? MOD_DEFS[id].emoji + " " + MOD_DEFS[id].name : id,
            ),
          ),
        )
      : null;

  const unlocks =
    r.newUnlocks && r.newUnlocks.length
      ? h(
          "div",
          {
            class: "row",
            style: "gap:.4rem;flex-wrap:wrap;justify-content:center",
          },
          h("span", { class: "gold" }, "🔓 Unlocked:"),
          r.newUnlocks.map((u) =>
            h("span", { class: "pick-tag gold" }, u.emoji + " " + u.name),
          ),
        )
      : null;

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
    unlocks,
    charLine,
    loadout,
    mods,
    summary,
    h("div", { class: "menu-actions" }, shop, retry, menu),
  );
}
