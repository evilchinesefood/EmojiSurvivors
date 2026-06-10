import { h } from "./Dom.js";
import { icon } from "./Icons.js";

const SKULLS = ["💀", "🎃", "👻", "🤡", "🦴"];

export function MenuScreen(ctx) {
  const wallet = h(
    "div",
    { class: "wallet" },
    ctx.meta.tainted ? "🥔" : icon("coin"),
    String(ctx.meta.coins),
  );
  const play = h(
    "wa-button",
    { variant: "brand", size: "l" },
    icon("play", { slot: "start" }),
    "Play",
  );
  play.addEventListener("click", () => ctx.onPlay());
  const coop = h(
    "wa-button",
    { size: "l", appearance: "outlined" },
    h("span", { slot: "start" }, "🤝"),
    "Co-op",
  );
  coop.addEventListener("click", () => ctx.onCoop());
  const shop = h(
    "wa-button",
    { size: "l", appearance: "outlined" },
    icon("shop", { slot: "start" }),
    "Shop",
  );
  shop.addEventListener("click", () => ctx.onShop());
  const records = h(
    "wa-button",
    { size: "l", appearance: "outlined" },
    icon("trophy", { slot: "start" }),
    "Records",
  );
  records.addEventListener("click", () => ctx.onRecords());
  const settings = h(
    "wa-button",
    { size: "l", appearance: "outlined" },
    icon("settings", { slot: "start" }),
    "Settings",
  );
  settings.addEventListener("click", () => ctx.onSettings());

  // Title-skull secret: clicking it cycles through silly skulls.
  let si = 0;
  const em = h("span", { class: "em" }, ctx.quack ? "🦆" : SKULLS[0]);
  if (!ctx.quack)
    em.addEventListener("click", () => {
      si = (si + 1) % SKULLS.length;
      em.textContent = SKULLS[si];
    });

  const seasonal = ctx.seasonal || {};
  const subtitle = ctx.quack
    ? "quack."
    : seasonal.halloween
      ? "happy halloween 🎃"
      : seasonal.friday13
        ? "unlucky night…"
        : "survive the swarm";

  return h(
    "div",
    { class: "screen screen-menu" },
    wallet,
    h(
      "div",
      { class: "title title-xl" },
      em,
      " " + (ctx.title || "EmojiSurvivors"),
    ),
    h("div", { class: "subtitle" }, subtitle),
    h("div", { class: "menu-actions" }, play, coop, shop, records, settings),
  );
}
