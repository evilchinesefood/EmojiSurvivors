// Boot orchestrator: builds sim + renderer + input + HUD + UI shell, owns the rAF
// loop, and routes state-machine transitions. The sim only advances while PLAYING;
// every other state freezes it and the shell shows an overlay.
import { S, makeMachine } from "./Engine/StateMachine.js";
import { createRunState } from "./Engine/State.js";
import { stepSim, createLoop } from "./Engine/GameLoop.js";
import { makeCamera } from "./World/Camera.js";
import { makeRenderer } from "./Render/Renderer.js";
import { makeInput } from "./Input/Input.js";
import { makeHud } from "./UI/Hud.js";
import { makeShell } from "./UI/Shell.js";
import { MenuScreen } from "./UI/MenuScreen.js";
import { PauseScreen } from "./UI/PauseScreen.js";
import { CHARACTERS, STARTER_ID } from "./Content/Characters.js";

if ("serviceWorker" in navigator) {
  addEventListener("load", () =>
    navigator.serviceWorker.register("./ServiceWorker.js").catch(() => {}),
  );
}

const canvas = document.getElementById("Game");
const ctx = canvas.getContext("2d");
const hudRoot = document.getElementById("Hud");
const overlay = document.getElementById("Overlay");

const camera = makeCamera();
function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.floor(innerWidth * dpr);
  canvas.height = Math.floor(innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  camera.resize(innerWidth, innerHeight);
}
addEventListener("resize", resize);
resize();

const machine = makeMachine(S.BOOT);

// M1 inline meta default — Meta/Save lands in M6.
const meta = {
  coins: 0,
  unlocked: [STARTER_ID],
  powerGrid: {},
  bestTimes: {},
  settings: { sfx: 0.6, shake: true, damageNumbers: true },
};

let state = null;
const renderer = makeRenderer(ctx);
const hud = makeHud(hudRoot, { onPause });

const input = makeInput({
  canvas,
  isPlaying: () => machine.is(S.PLAYING),
  onPause: () => {
    if (machine.is(S.PLAYING)) onPause();
    else if (machine.is(S.PAUSED)) resume();
  },
});

function trayItems() {
  return []; // weapon/passive tray lands in M2.
}

function startRun(characterId, runLength) {
  const character = CHARACTERS[characterId] || CHARACTERS[STARTER_ID];
  state = createRunState({
    seed: (Date.now() ^ (performance.now() * 1000)) >>> 0,
    runLength,
    character,
    powerGrid: meta.powerGrid,
  });
  camera.follow(state.player.x, state.player.y);
  machine.set(S.PLAYING);
}

function onPause() {
  if (machine.is(S.PLAYING)) machine.set(S.PAUSED);
}
function resume() {
  if (machine.is(S.PAUSED)) machine.set(S.PLAYING);
}
function restart() {
  if (state) startRun(state.character.id, state.runLength);
}
function quitToMenu() {
  state = null;
  machine.set(S.MENU);
}

const screens = {
  [S.MENU]: () =>
    MenuScreen({
      meta,
      onPlay: () => startRun(STARTER_ID, 300),
      onShop: () => {},
      onSettings: () => {},
    }),
  [S.PAUSED]: () =>
    PauseScreen({ onResume: resume, onRestart: restart, onQuit: quitToMenu }),
};

makeShell({ overlay, hud, machine, screens });

const loop = createLoop(
  (dt) => {
    if (machine.is(S.PLAYING)) {
      state.input.move = input.getIntent(camera, state.player);
      stepSim(state, dt);
    }
  },
  () => {
    if (state) {
      camera.follow(state.player.x, state.player.y);
      renderer.render(state, camera);
      hud.update(state, trayItems());
    } else {
      renderer.background(camera);
    }
  },
);
loop.start();
machine.set(S.MENU);
