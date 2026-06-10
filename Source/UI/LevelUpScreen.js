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
  // When every card is a filler (the real pool is exhausted), offer to LOCK one so it
  // auto-applies every level-up from now on instead of re-prompting the same hand.
  const allFiller = ctx.choices.every(
    (c) => c.kind === "heal" || c.kind === "coins",
  );
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
    // Dead pool: a "lock & auto" button picks this filler AND auto-applies it for the
    // rest of the run (no more identical prompts).
    if (allFiller && (c.kind === "heal" || c.kind === "coins")) {
      const lock = h(
        "button",
        {
          class: "pick-lock",
          type: "button",
          "aria-label": "Auto-pick this for the rest of the run",
        },
        icon("lock", { noTone: true }),
      );
      lock.addEventListener("click", (e) => {
        e.stopPropagation();
        ctx.onLock(c);
      });
      card.appendChild(lock);
    }
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
  if (allFiller)
    kids.push(
      h(
        "div",
        { class: "subtitle" },
        "Nothing left to upgrade — ",
        icon("lock", { noTone: true }),
        " lock one to auto-collect it.",
      ),
    );
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
