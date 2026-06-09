import { h } from "./Dom.js";
import { icon } from "./Icons.js";
import { CHARACTERS, CHARACTER_IDS } from "../Content/Characters.js";
import { WEAPONS } from "../Content/Weapons.js";

export function SelectScreen(ctx) {
  const cards = CHARACTER_IDS.map((id) => {
    const c = CHARACTERS[id];
    const w = WEAPONS[c.weapon];
    const card = h(
      "div",
      { class: "pick-card", role: "button", tabindex: "0" },
      h("div", { class: "pick-emoji" }, c.emoji),
      h("div", { class: "pick-name" }, c.name),
      h(
        "div",
        { class: "pick-tag" },
        w.emoji + " " + w.name + " · " + c.passive.emoji + " " + c.passive.name,
      ),
      h("div", { class: "pick-desc" }, c.blurb),
      h(
        "div",
        { class: "pick-foot" },
        h("span", { class: "pick-tag good" }, icon("check"), " Ready"),
      ),
    );
    const go = () => ctx.onSelect(id);
    card.addEventListener("click", go);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        go();
      }
    });
    return card;
  });

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
    h(
      "div",
      { class: "title", style: "font-size:clamp(1.6rem,6vw,2.6rem)" },
      "Choose your survivor",
    ),
    h("div", { class: "card-grid" }, cards),
    back,
  );
}
