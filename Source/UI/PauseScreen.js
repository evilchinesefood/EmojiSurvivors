import { h } from "./Dom.js";
import { icon } from "./Icons.js";

export function PauseScreen(ctx) {
  const resume = h(
    "wa-button",
    { variant: "brand", size: "l" },
    icon("resume", { slot: "start" }),
    "Resume",
  );
  resume.addEventListener("click", () => ctx.onResume());
  const restart = h(
    "wa-button",
    { size: "l", appearance: "outlined" },
    icon("restart", { slot: "start" }),
    "Restart",
  );
  restart.addEventListener("click", () => ctx.onRestart());
  const quit = h(
    "wa-button",
    { size: "l", appearance: "outlined" },
    icon("quit", { slot: "start" }),
    "Quit",
  );
  quit.addEventListener("click", () => ctx.onQuit());

  return h(
    "div",
    { class: "screen screen-dim" },
    h(
      "div",
      { class: "title", style: "font-size:clamp(1.6rem,6vw,2.6rem)" },
      "Paused",
    ),
    h("div", { class: "menu-actions" }, resume, restart, quit),
  );
}
