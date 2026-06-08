// Owns overlay mounting + HUD visibility, driven by the state machine. `screens` is
// a map of state → factory returning a DOM node (or null for no overlay, e.g.
// PLAYING). Re-renders on every machine transition.
import { mount } from "./Dom.js";
import { S } from "../Engine/StateMachine.js";

const HUD_STATES = new Set([S.PLAYING, S.PAUSED, S.LEVELUP]);

export function makeShell({ overlay, hud, machine, screens }) {
  function render() {
    const s = machine.current;
    const factory = screens[s];
    mount(overlay, factory ? factory() : null);
    if (HUD_STATES.has(s)) hud.show();
    else hud.hide();
  }
  machine.onChange(render);
  return { render };
}
