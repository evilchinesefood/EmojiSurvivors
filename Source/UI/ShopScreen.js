import { h } from "./Dom.js";
import { icon } from "./Icons.js";
import { CHARACTERS, CHARACTER_IDS } from "../Content/Characters.js";
import { WEAPONS } from "../Content/Weapons.js";
import { POWER_GRID, POWER_GRID_IDS } from "../Content/PowerGrid.js";

export function ShopScreen(ctx) {
  const meta = ctx.meta;
  const wallet = h(
    "div",
    { class: "wallet" },
    icon("coin"),
    String(meta.coins),
  );

  const charCards = CHARACTER_IDS.filter((id) => CHARACTERS[id].price > 0).map(
    (id) => {
      const c = CHARACTERS[id];
      const owned = meta.isUnlocked(id);
      let foot;
      if (owned) {
        foot = h("span", { class: "pick-tag good" }, icon("check"), " Owned");
      } else {
        const b = h(
          "wa-button",
          { variant: "brand", size: "s" },
          icon("coin", { slot: "start" }),
          String(c.price),
        );
        b.disabled = meta.coins < c.price;
        b.addEventListener("click", () => {
          if (meta.unlockCharacter(id)) ctx.refresh();
        });
        foot = b;
      }
      return h(
        "div",
        { class: "pick-card" },
        h("div", { class: "pick-emoji" }, c.emoji),
        h("div", { class: "pick-name" }, c.name),
        h(
          "div",
          { class: "pick-tag" },
          WEAPONS[c.weapon].emoji +
            " " +
            WEAPONS[c.weapon].name +
            " · " +
            c.passive.emoji +
            " " +
            c.passive.name,
        ),
        h("div", { class: "pick-desc" }, c.blurb),
        h("div", { class: "pick-foot" }, foot),
      );
    },
  );

  const rows = POWER_GRID_IDS.map((stat) => {
    const row = POWER_GRID[stat];
    const lvl = meta.gridLevel(stat);
    const cost = meta.gridCost(stat);
    const maxed = lvl >= row.max;
    const pips = h(
      "div",
      { class: "gr-pips" },
      Array.from({ length: row.max }, (_, i) =>
        h("div", { class: "gr-pip" + (i < lvl ? " on" : "") }),
      ),
    );
    let buy;
    if (maxed) {
      buy = h("span", { class: "pick-tag good" }, "MAX");
    } else {
      const b = h(
        "wa-button",
        { size: "s", variant: "brand" },
        icon("coin", { slot: "start" }),
        String(cost),
      );
      b.disabled = meta.coins < cost;
      b.addEventListener("click", () => {
        if (meta.buyGrid(stat)) ctx.refresh();
      });
      buy = b;
    }
    return h(
      "div",
      { class: "grid-row" },
      h(
        "div",
        { class: "gr-name" },
        h(
          "span",
          { class: "pick-emoji", style: "font-size:1.4rem" },
          row.emoji,
        ),
        h(
          "div",
          { class: "col", style: "gap:0" },
          h("strong", {}, row.name),
          h("span", { class: "pick-tag" }, row.desc),
        ),
      ),
      pips,
      buy,
    );
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
      {
        class: "row",
        style: "justify-content:space-between;width:min(900px,94vw)",
      },
      h(
        "div",
        { class: "title", style: "font-size:clamp(1.4rem,5vw,2.2rem)" },
        "Shop",
      ),
      wallet,
    ),
    h("div", { class: "subtitle" }, "Heroes"),
    h("div", { class: "card-grid" }, charCards),
    h("div", { class: "subtitle" }, "Power Grid"),
    h("div", { class: "shop-grid" }, rows),
    back,
  );
}
