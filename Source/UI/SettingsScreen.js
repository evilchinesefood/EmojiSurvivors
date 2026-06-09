import { h } from "./Dom.js";
import { icon } from "./Icons.js";

export function SettingsScreen(ctx) {
  const s = ctx.meta.settings;

  const vol = h("input", {
    type: "range",
    min: "0",
    max: "100",
    value: String(Math.round(s.sfx * 100)),
    class: "es-range",
    "aria-label": "SFX Volume",
  });
  vol.addEventListener("input", () =>
    ctx.meta.setSetting("sfx", Number(vol.value) / 100),
  );

  // WA boolean state is the `checked` PROPERTY (not the attribute) — use prop:checked.
  const toggle = (on, key, label) => {
    const el = h("wa-switch", { "prop:checked": !!on, "aria-label": label });
    el.addEventListener("change", () => ctx.meta.setSetting(key, el.checked));
    return el;
  };

  const name = h("input", {
    type: "text",
    class: "es-text",
    value: ctx.meta.playerName || "",
    maxlength: "24",
    placeholder: "Anonymous 👻",
    "aria-label": "Leaderboard Name",
  });
  name.addEventListener("change", () => ctx.meta.setPlayerName(name.value));

  const shake = toggle(s.shake, "shake", "Screen Shake");
  const dmg = toggle(s.damageNumbers, "damageNumbers", "Damage Numbers");
  const aim = toggle(s.manualAim, "manualAim", "Manual Aim");
  // Reduced Motion defaults from the OS preference until the player sets it explicitly.
  const reduceEff =
    s.reducedMotion != null
      ? s.reducedMotion
      : !!(
          globalThis.matchMedia &&
          matchMedia("(prefers-reduced-motion: reduce)").matches
        );
  const reduce = toggle(reduceEff, "reducedMotion", "Reduced Motion");

  const row = (ic, label, control) =>
    h(
      "div",
      { class: "settings-row" },
      h("span", { class: "hud-stat" }, icon(ic), " " + label),
      control,
    );

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
      { class: "title", style: "font-size:clamp(1.4rem,5vw,2.2rem)" },
      "Settings",
    ),
    h(
      "div",
      { class: "col", style: "align-items:center" },
      row("volume", "SFX Volume", vol),
      row("trophy", "Board Name", name),
      row("shake", "Screen Shake", shake),
      row("motion", "Reduced Motion", reduce),
      row("hash", "Damage Numbers", dmg),
      row("swords", "Manual Aim", aim),
    ),
    back,
  );
}
