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
      "div",
      { class: "pick-card", role: "button", tabindex: "0" },
      h("div", { class: "pick-emoji" }, c.emoji),
      h("div", { class: "pick-name" }, c.label),
      h("div", { class: "pick-tag" }, TAGS[c.kind] || ""),
      h("div", { class: "pick-desc" }, c.desc),
    );
    const go = () => ctx.onPick(c);
    card.addEventListener("click", go);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        go();
      }
    });
    // Banish removes this card's id from the run pool (free, 1/run, not a reroll).
    if (ctx.banishesLeft > 0 && c.id) {
      const ban = h(
        "button",
        {
          class: "pick-banish",
          type: "button",
          "aria-label": "Banish for this run",
        },
        icon("ban", { noTone: true }),
      );
      ban.addEventListener("click", (e) => {
        e.stopPropagation();
        ctx.onBanish(c);
      });
      card.appendChild(ban);
    }
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

  const actions = [];
  if (ctx.rerollsLeft > 0) {
    const rb = h(
      "wa-button",
      { appearance: "outlined", size: "s" },
      icon("reroll", { slot: "start" }),
      "Reroll (" + ctx.rerollsLeft + ")",
    );
    rb.addEventListener("click", () => ctx.onReroll());
    actions.push(rb);
  }
  if (ctx.banishesLeft > 0) {
    actions.push(
      h(
        "span",
        { class: "pick-tag muted" },
        icon("ban", { noTone: true }),
        " Banish: " + ctx.banishesLeft,
      ),
    );
  }
  if (actions.length) kids.push(h("div", { class: "row" }, actions));

  return h("div", { class: "screen screen-dim levelup" }, kids);
}
