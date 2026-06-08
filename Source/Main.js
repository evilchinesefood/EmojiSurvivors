// Boot orchestrator: builds sim + renderer + input + HUD + UI shell, owns the rAF
// loop, and routes state-machine transitions. The sim only advances while PLAYING;
// every other state freezes it and the shell shows an overlay.
import { S, makeMachine } from "./Engine/StateMachine.js";
import { createRunState } from "./Engine/State.js";
import { stepSim, createLoop } from "./Engine/GameLoop.js";
import { makeCamera } from "./World/Camera.js";
import { makeRenderer } from "./Render/Renderer.js";
import { makeParticles } from "./Render/Particles.js";
import { makeFx } from "./Render/Fx.js";
import { makeInput } from "./Input/Input.js";
import { makeHud } from "./UI/Hud.js";
import { makeShell } from "./UI/Shell.js";
import { MenuScreen } from "./UI/MenuScreen.js";
import { SelectScreen } from "./UI/SelectScreen.js";
import { ConfigScreen } from "./UI/ConfigScreen.js";
import { PauseScreen } from "./UI/PauseScreen.js";
import { LevelUpScreen } from "./UI/LevelUpScreen.js";
import { ResultScreen } from "./UI/ResultScreen.js";
import { ShopScreen } from "./UI/ShopScreen.js";
import { SettingsScreen } from "./UI/SettingsScreen.js";
import { levelUpChoices, applyChoice } from "./Systems/Leveling.js";
import { makeSfx } from "./Audio/Sfx.js";
import { makeMeta } from "./Meta/Meta.js";
import { CHARACTERS, STARTER_ID } from "./Content/Characters.js";
import { WEAPONS } from "./Content/Weapons.js";
import { PASSIVES } from "./Content/Passives.js";

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

// Persistent account state (coins, unlocks, power grid, best times, settings).
const meta = makeMeta(globalThis.localStorage);

let state = null;
let selectedCharId = STARTER_ID;
let lastSummary = { time: 0, kills: 0, level: 1, coins: 0 };
const renderer = makeRenderer(ctx);
const particles = makeParticles();
const fx = makeFx();
const hud = makeHud(hudRoot, { onPause });
const sfx = makeSfx(() => meta.settings.sfx);

const input = makeInput({
  canvas,
  isPlaying: () => machine.is(S.PLAYING),
  onPause: () => {
    if (machine.is(S.PLAYING)) onPause();
    else if (machine.is(S.PAUSED)) resume();
  },
});

// Unlock/resume the AudioContext on the first user gesture (autoplay policy).
addEventListener("pointerdown", () => sfx.unlock(), { passive: true });
addEventListener("keydown", () => sfx.unlock());

// Route drained sim events to audio + particles + screen FX.
function handleEvents() {
  const p = state.player;
  const shakeOn = meta.settings.shake;
  for (const ev of state.events) {
    sfx.play(ev.type);
    switch (ev.type) {
      case "damage":
        if (meta.settings.damageNumbers && Math.random() < 0.5)
          particles.text(ev.x, ev.y - 12, String(ev.amount), "#fff");
        break;
      case "kill":
        particles.puff(
          ev.x,
          ev.y,
          ev.boss || ev.elite ? "#e8c14a" : "rgba(184,160,210,0.9)",
          ev.boss ? 22 : ev.elite ? 12 : 6,
          ev.boss ? 7 : 4,
        );
        if (ev.boss && shakeOn) fx.shake(0.8);
        break;
      case "hurt":
        fx.hurt(shakeOn);
        break;
      case "levelup":
        particles.ring(p.x, p.y, "#e8c14a");
        break;
      case "evolve":
        particles.ring(p.x, p.y, "#9b6cff");
        particles.spark(p.x, p.y, "#b89bff", 22, 220);
        break;
      case "explode":
        particles.spark(ev.x, ev.y, "rgba(255,140,60,0.95)", 12, 220);
        if (shakeOn) fx.shake(0.18);
        break;
      case "boss":
        if (shakeOn) fx.shake(0.7);
        break;
      case "victory":
        particles.ring(p.x, p.y, "#e8c14a");
        break;
    }
  }
  state.events.length = 0;
}

function trayItems() {
  if (!state) return [];
  const items = [];
  for (const w of state.player.weapons) {
    const def = WEAPONS[w.id];
    if (def)
      items.push({ emoji: def.emoji, level: w.level, evolved: !!def.evolved });
  }
  for (const id in state.player.passives) {
    const pd = PASSIVES[id];
    if (pd)
      items.push({
        emoji: pd.emoji,
        level: state.player.passives[id],
        evolved: false,
      });
  }
  return items;
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

function endRun() {
  const won = state.outcome === "victory";
  meta.bankRun(state.runLength, state.player.coins, state.time);
  lastSummary = {
    time: state.time,
    kills: state.player.kills,
    level: state.player.level,
    coins: state.player.coins,
  };
  machine.set(won ? S.VICTORY : S.GAMEOVER);
}

function pickChoice(c) {
  applyChoice(state, c);
  if (state.awaitingLevelUp) shell.render();
  else machine.set(S.PLAYING);
}

const screens = {
  [S.MENU]: () =>
    MenuScreen({
      meta,
      onPlay: () => machine.set(S.SELECT),
      onShop: () => machine.set(S.SHOP),
      onSettings: () => machine.set(S.SETTINGS),
    }),
  [S.SHOP]: () =>
    ShopScreen({
      meta,
      onBack: () => machine.set(S.MENU),
      refresh: () => shell.render(),
    }),
  [S.SETTINGS]: () =>
    SettingsScreen({ meta, onBack: () => machine.set(S.MENU) }),
  [S.SELECT]: () =>
    SelectScreen({
      meta,
      onSelect: (id) => {
        selectedCharId = id;
        machine.set(S.CONFIG);
      },
      onBack: () => machine.set(S.MENU),
    }),
  [S.CONFIG]: () =>
    ConfigScreen({
      character: selectedCharId,
      onStart: (len) => startRun(selectedCharId, len),
      onBack: () => machine.set(S.SELECT),
    }),
  [S.PAUSED]: () =>
    PauseScreen({ onResume: resume, onRestart: restart, onQuit: quitToMenu }),
  [S.LEVELUP]: () =>
    LevelUpScreen({
      count: state.pendingLevelUps,
      choices: levelUpChoices(state),
      rerollsLeft: state.rerollsLeft,
      onPick: pickChoice,
      onReroll: () => {
        if (state.rerollsLeft > 0) {
          state.rerollsLeft -= 1;
          shell.render();
        }
      },
    }),
  [S.VICTORY]: () =>
    ResultScreen({
      victory: true,
      summary: lastSummary,
      onShop: () => {
        state = null;
        machine.set(S.SHOP);
      },
      onRetry: restart,
      onMenu: quitToMenu,
    }),
  [S.GAMEOVER]: () =>
    ResultScreen({
      victory: false,
      summary: lastSummary,
      onShop: () => {
        state = null;
        machine.set(S.SHOP);
      },
      onRetry: restart,
      onMenu: quitToMenu,
    }),
};

const shell = makeShell({ overlay, hud, machine, screens });

const loop = createLoop(
  (dt) => {
    if (machine.is(S.PLAYING)) {
      state.input.move = input.getIntent(camera, state.player);
      stepSim(state, dt);
      handleEvents();
      particles.update(dt);
      if (state.outcome) endRun();
      else if (state.awaitingLevelUp) machine.set(S.LEVELUP);
    }
    // Decay shake every frame (even paused/overlay) so frozen frames settle.
    fx.update(dt);
  },
  () => {
    if (state) {
      camera.follow(state.player.x, state.player.y);
      const sh = fx.offset();
      renderer.render(state, camera, sh);
      ctx.save();
      ctx.translate(sh.x, sh.y);
      particles.draw(ctx, camera);
      ctx.restore();
      fx.drawVignette(ctx, camera.w, camera.h);
      hud.update(state, trayItems());
    } else {
      renderer.background(camera);
    }
  },
);
loop.start();
machine.set(S.MENU);
