import { h } from "./Dom.js";
import { icon } from "./Icons.js";
import { CHARACTERS } from "../Content/Characters.js";
import { RUN_LENGTHS } from "../Content/Curve.js";
import {
  MOD_DEFS,
  MOD_IDS,
  modDefault,
  modActive,
  modValueLabel,
  unlockLabel,
} from "../Content/Modifiers.js";

const LABELS = { 300: "5 min", 600: "10 min", 900: "15 min", 1800: "30 min" };
const SUBS = {
  300: "Quick raid",
  600: "Standard night",
  900: "The long dark",
  1800: "Endurance",
};

// One modifier row: a control if unlocked, a lock + requirement if not.
function modRow(def, sel, meta, onChange) {
  const unlocked = meta.isModifierUnlocked(def);
  const label = h(
    "div",
    { class: "row", style: "gap:.5rem;flex:1;align-items:center;min-width:0" },
    h("span", { class: "pick-emoji", style: "font-size:1.3rem" }, def.emoji),
    h(
      "div",
      {
        class: "col",
        style: "gap:0;align-items:flex-start;flex:1;min-width:0",
      },
      h("strong", {}, def.name),
      h(
        "span",
        { class: "pick-tag", style: "white-space:normal" },
        unlocked ? def.desc : unlockLabel(def) + " to unlock",
      ),
    ),
  );

  let control;
  if (!unlocked) {
    control = h("span", { class: "pick-tag" }, icon("lock"));
  } else if (def.type === "toggle") {
    const sw = h("wa-switch", {
      "prop:checked": !!sel[def.id],
      "aria-label": def.name,
    });
    sw.addEventListener("change", () => {
      sel[def.id] = sw.checked;
      onChange();
    });
    control = sw;
  } else {
    const opts = def.options;
    const cur = () => (def.id in sel ? sel[def.id] : modDefault(def));
    const chip = h(
      "wa-button",
      { size: "s", appearance: "outlined", pill: true },
      modValueLabel(def, cur()),
    );
    chip.addEventListener("click", () => {
      const i = opts.indexOf(cur());
      const next = opts[(i + 1) % opts.length];
      sel[def.id] = next;
      chip.textContent = modValueLabel(def, next);
      chip.setAttribute("variant", modActive(def, next) ? "brand" : "neutral");
      onChange();
    });
    if (modActive(def, cur())) chip.setAttribute("variant", "brand");
    control = chip;
  }

  return h(
    "div",
    {
      class: "grid-row",
      style: "gap:.6rem;align-items:center" + (unlocked ? "" : ";opacity:.5"),
    },
    label,
    control,
  );
}

export function ConfigScreen(ctx) {
  const c = CHARACTERS[ctx.character];
  const meta = ctx.meta;
  let chosen = 300;

  // Seed selection from last run, dropping anything now invalid or locked.
  const sel = {};
  const last = (meta && meta.lastModifiers) || {};
  for (const id of MOD_IDS) {
    const def = MOD_DEFS[id];
    if (!meta || !meta.isModifierUnlocked(def)) continue;
    if (id in last) {
      if (def.type === "toggle") {
        if (last[id]) sel[id] = true;
      } else if (def.options.includes(last[id]) && last[id] !== def.default) {
        sel[id] = last[id];
      }
    }
  }

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

  const countBadge = h("span", { class: "pick-tag" }, "");
  const recount = () => {
    let n = 0;
    for (const id of MOD_IDS)
      if (id in sel && modActive(MOD_DEFS[id], sel[id])) n++;
    countBadge.textContent = n ? n + " active" : "none";
  };
  const rows = MOD_IDS.map((id) => modRow(MOD_DEFS[id], sel, meta, recount));
  recount();
  const modPanel = h(
    "wa-details",
    { class: "mod-panel" },
    h(
      "div",
      { slot: "summary", class: "row", style: "gap:.5rem;align-items:center" },
      "⚙️ Modifiers",
      countBadge,
    ),
    h("div", { class: "mod-list" }, rows),
  );

  const start = h(
    "wa-button",
    { variant: "brand", size: "l" },
    icon("play", { slot: "start" }),
    "Begin",
  );
  start.addEventListener("click", () => ctx.onStart(chosen, sel));
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
    modPanel,
    h("div", { class: "menu-actions", style: "margin-top:.6rem" }, start),
    back,
  );
}
