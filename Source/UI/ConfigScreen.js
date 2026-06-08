import { h } from "./Dom.js";
import { icon } from "./Icons.js";
import { CHARACTERS } from "../Content/Characters.js";
import { RUN_LENGTHS } from "../Content/Curve.js";

const LABELS = { 300: "5 min", 600: "10 min", 900: "15 min" };
const SUBS = {
  300: "Quick raid",
  600: "Standard night",
  900: "The long dark",
};

export function ConfigScreen(ctx) {
  const c = CHARACTERS[ctx.character];
  let chosen = 300;

  const buttons = RUN_LENGTHS.map((len) => {
    const b = h(
      "wa-button",
      {
        size: "l",
        variant: len === chosen ? "brand" : "neutral",
        appearance: len === chosen ? "filled" : "outlined",
      },
      h(
        "div",
        { class: "col", style: "align-items:center;gap:.1rem" },
        h("strong", {}, LABELS[len]),
        h("span", { class: "pick-tag" }, SUBS[len]),
      ),
    );
    b.addEventListener("click", () => {
      chosen = len;
      buttons.forEach((bb, i) => {
        const on = RUN_LENGTHS[i] === chosen;
        bb.setAttribute("variant", on ? "brand" : "neutral");
        bb.setAttribute("appearance", on ? "filled" : "outlined");
      });
    });
    return b;
  });

  const start = h(
    "wa-button",
    { variant: "brand", size: "l" },
    icon("play", { slot: "start" }),
    "Begin",
  );
  start.addEventListener("click", () => ctx.onStart(chosen));
  const back = h(
    "wa-button",
    { appearance: "outlined", size: "m" },
    icon("back", { slot: "start" }),
    "Back",
  );
  back.addEventListener("click", () => ctx.onBack());

  return h(
    "div",
    { class: "screen" },
    h("div", { class: "pick-emoji", style: "font-size:3.4rem" }, c.emoji),
    h(
      "div",
      { class: "title", style: "font-size:clamp(1.4rem,5vw,2.2rem)" },
      c.name,
    ),
    h("div", { class: "subtitle" }, "how long can you survive?"),
    h("div", { class: "seg" }, buttons),
    h("div", { class: "menu-actions", style: "margin-top:.6rem" }, start),
    back,
  );
}
