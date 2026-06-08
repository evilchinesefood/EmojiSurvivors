import { h } from "./Dom.js";
import { icon } from "./Icons.js";

export function MenuScreen(ctx) {
  const wallet = h(
    "div",
    { class: "wallet" },
    icon("coin"),
    String(ctx.meta.coins),
  );
  const play = h(
    "wa-button",
    { variant: "brand", size: "l" },
    icon("play", { slot: "start" }),
    "Play",
  );
  play.addEventListener("click", () => ctx.onPlay());
  const shop = h(
    "wa-button",
    { size: "l", appearance: "outlined" },
    icon("shop", { slot: "start" }),
    "Shop",
  );
  shop.addEventListener("click", () => ctx.onShop());
  const settings = h(
    "wa-button",
    { size: "l", appearance: "outlined" },
    icon("settings", { slot: "start" }),
    "Settings",
  );
  settings.addEventListener("click", () => ctx.onSettings());

  return h(
    "div",
    { class: "screen" },
    wallet,
    h(
      "div",
      { class: "title title-xl" },
      h("span", { class: "em" }, "💀"),
      " EmojiSurvivors",
    ),
    h("div", { class: "subtitle" }, "survive the swarm"),
    h("div", { class: "menu-actions" }, play, shop, settings),
  );
}
