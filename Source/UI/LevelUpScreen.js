import { h } from "./Dom.js";
import { icon } from "./Icons.js";

const TAGS = {
  "weapon-new": "New Weapon",
  "weapon-up": "Weapon",
  "passive-new": "New Passive",
  "passive-up": "Passive",
  evolution: "✦ Evolution ✦",
  heal: "Recover",
  coins: "Bonus",
};

export function LevelUpScreen(ctx) {
  const cards = ctx.choices.map((c) => {
    const card = h(
      "button",
      { class: "pick-card", type: "button" },
      h("div", { class: "pick-emoji" }, c.emoji),
      h("div", { class: "pick-name" }, c.label),
      h("div", { class: "pick-tag" }, TAGS[c.kind] || ""),
      h("div", { class: "pick-desc" }, c.desc),
    );
    card.addEventListener("click", () => ctx.onPick(c));
    return card;
  });

  const kids = [
    h(
      "div",
      { class: "title", style: "font-size:clamp(1.4rem,5vw,2.2rem)" },
      icon("up"),
      " Level Up!",
    ),
  ];
  if (ctx.count > 1)
    kids.push(h("div", { class: "subtitle" }, ctx.count + " level-ups queued"));
  kids.push(h("div", { class: "choice-grid" }, cards));
  if (ctx.rerollsLeft > 0) {
    const rb = h(
      "wa-button",
      { appearance: "outlined", size: "s" },
      icon("reroll", { slot: "start" }),
      "Reroll (" + ctx.rerollsLeft + ")",
    );
    rb.addEventListener("click", () => ctx.onReroll());
    kids.push(rb);
  }
  return h("div", { class: "screen screen-dim" }, kids);
}
