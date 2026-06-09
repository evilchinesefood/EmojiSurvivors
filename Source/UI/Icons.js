// FA Pro Duotone chrome icons (NOT game entities — those are emoji on the canvas).
// icon(concept, opts?) → an <i> element. opts is an OBJECT: {noTone, class, primary,
// secondary}. Duotone tones default to the theme (bone primary, arcane secondary).
import { h } from "./Dom.js";

export const ICONS = {
  play: { name: "play" },
  shop: { name: "bag-shopping", primary: "var(--gold)" },
  settings: { name: "gear" },
  back: { name: "arrow-left" },
  timer: { name: "clock" },
  coin: { name: "coins", primary: "var(--gold)" },
  heart: { name: "heart", primary: "var(--hp)" },
  level: { name: "star", primary: "var(--gold)" },
  skull: { name: "skull" },
  pause: { name: "pause" },
  resume: { name: "play" },
  restart: { name: "rotate-right" },
  quit: { name: "house" },
  lock: { name: "lock" },
  bolt: { name: "bolt", primary: "var(--xp)" },
  trophy: { name: "trophy", primary: "var(--gold)" },
  ghost: { name: "ghost", primary: "var(--arcane-lt)" },
  swords: { name: "swords" },
  kills: { name: "skull-crossbones" },
  up: { name: "circle-up", primary: "var(--good)" },
  volume: { name: "volume-high" },
  shake: { name: "wave-pulse" },
  hash: { name: "hashtag" },
  check: { name: "circle-check", primary: "var(--good)" },
  reroll: { name: "dice", primary: "var(--gold)" },
  ban: { name: "ban", primary: "var(--bad)" },
  records: { name: "chart-simple", primary: "var(--gold)" },
};

function styleFor(p, s) {
  const out = [];
  if (p) out.push("--fa-primary-color:" + p);
  if (s) out.push("--fa-secondary-color:" + s);
  return out.join(";");
}

export function icon(concept, opts = {}) {
  const i = ICONS[concept] || { name: "circle-question" };
  const cls =
    "fa-duotone fa-solid fa-" + i.name + (opts.class ? " " + opts.class : "");
  const props = { class: cls, "aria-hidden": "true" };
  if (!opts.noTone) {
    const st = styleFor(
      opts.primary ?? i.primary,
      opts.secondary ?? i.secondary,
    );
    if (st) props.style = st;
  }
  if (opts.slot) props.slot = opts.slot;
  return h("i", props);
}

export function iconName(concept) {
  return (ICONS[concept] || { name: "circle-question" }).name;
}
