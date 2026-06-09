import { h } from "./Dom.js";
import { icon } from "./Icons.js";
import { RUN_LENGTHS } from "../Content/Curve.js";
import { MOD_DEFS } from "../Content/Modifiers.js";
import { CHARACTERS } from "../Content/Characters.js";
import { topFor } from "../Meta/Records.js";
import { fetchBoard } from "../Meta/OnlineBoard.js";

const LABELS = { 300: "5 min", 600: "10 min", 900: "15 min" };

function mmss(sec) {
  const s = Math.max(0, Math.floor(sec));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}

export function RecordsScreen(ctx) {
  const meta = ctx.meta;
  const view = { scope: "local", len: 300, mode: "standard", diff: "normal" };
  let fetchSeq = 0;

  const controls = h("div", {
    class: "col",
    style: "gap:.5rem;align-items:center",
  });
  const list = h("div", {
    class: "col rec-list",
    style: "gap:.4rem;width:min(560px,94vw)",
  });

  const metricLabel = (e) =>
    e.endless
      ? "score " + e.score
      : (e.won ? "✓ won · " : "✗ ") + e.kills + " kills";
  const when = (e) => (e.date ? new Date(e.date).toLocaleDateString() : "");

  const row = (e, i, global) =>
    h(
      "div",
      { class: "grid-row", style: "gap:.6rem" },
      h("span", { class: "pick-tag", style: "min-width:2ch" }, "#" + (i + 1)),
      h(
        "span",
        { class: "pick-emoji", style: "font-size:1.3rem" },
        (CHARACTERS[e.character] || {}).emoji || "❔",
      ),
      h(
        "div",
        { class: "col", style: "gap:0;flex:1;min-width:0" },
        h("strong", {}, global ? e.n || "Anonymous 👻" : metricLabel(e)),
        h("span", { class: "pick-tag" }, global ? metricLabel(e) : when(e)),
      ),
      h(
        "span",
        { class: "pick-tag" },
        (e.mods || []).map((id) => (MOD_DEFS[id] || {}).emoji || "").join(""),
      ),
      h("span", { class: "pick-tag" }, mmss(e.time) + " · L" + (e.level || 1)),
    );

  function fill(entries, global) {
    if (!entries.length) {
      list.replaceChildren(
        h("div", { class: "subtitle" }, "no runs here yet — die heroically"),
      );
      return;
    }
    list.replaceChildren(...entries.map((e, i) => row(e, i, global)));
  }

  const seg = (options, key) =>
    h(
      "div",
      { class: "seg" },
      options.map(([value, label]) => {
        const b = h(
          "wa-button",
          {
            size: "s",
            ...(view[key] === value
              ? { variant: "brand" }
              : { appearance: "outlined" }),
          },
          label,
        );
        b.addEventListener("click", () => {
          view[key] = value;
          render();
        });
        return b;
      }),
    );

  function render() {
    controls.replaceChildren(
      seg(
        [
          ["local", "Local"],
          ["global", "Global"],
        ],
        "scope",
      ),
      h(
        "div",
        {
          class: "row",
          style: "gap:.5rem;flex-wrap:wrap;justify-content:center",
        },
        seg(
          RUN_LENGTHS.map((l) => [l, LABELS[l]]),
          "len",
        ),
        seg(
          [
            ["standard", "Standard"],
            ["endless", "Endless"],
          ],
          "mode",
        ),
        seg(
          [
            ["normal", "Normal"],
            ["hard", "💀 Hard"],
          ],
          "diff",
        ),
      ),
    );
    const key = view.len + ":" + view.mode + ":" + view.diff;
    if (view.scope === "local") {
      fill(topFor(meta.records, key), false);
    } else {
      list.replaceChildren(
        h("div", { class: "subtitle" }, "summoning the global dead…"),
      );
      const seq = ++fetchSeq;
      fetchBoard(key).then((entries) => {
        if (seq !== fetchSeq) return; // superseded by a newer pick
        if (!entries)
          list.replaceChildren(
            h(
              "div",
              { class: "subtitle" },
              "couldn't reach the board — offline?",
            ),
          );
        else fill(entries, true);
      });
    }
  }
  render();

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
      icon("trophy"),
      " Records",
    ),
    controls,
    list,
    back,
  );
}
