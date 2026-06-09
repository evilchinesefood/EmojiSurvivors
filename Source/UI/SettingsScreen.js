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
  });
  vol.addEventListener("input", () =>
    ctx.meta.setSetting("sfx", Number(vol.value) / 100),
  );

  const shake = h("wa-switch", s.shake ? { checked: true } : {});
  shake.addEventListener("change", () =>
    ctx.meta.setSetting("shake", shake.checked),
  );

  const dmg = h("wa-switch", s.damageNumbers ? { checked: true } : {});
  dmg.addEventListener("change", () =>
    ctx.meta.setSetting("damageNumbers", dmg.checked),
  );

  const aim = h("wa-switch", s.manualAim ? { checked: true } : {});
  aim.addEventListener("change", () =>
    ctx.meta.setSetting("manualAim", aim.checked),
  );

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
      row("shake", "Screen Shake", shake),
      row("hash", "Damage Numbers", dmg),
      row("swords", "Manual Aim", aim),
    ),
    back,
  );
}
