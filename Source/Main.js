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
import { WEAPONS, scaleWeapon } from "./Content/Weapons.js";
import { PASSIVES } from "./Content/Passives.js";

// Display heuristic (not sim logic): rough damage-per-second of the final build.
function estimateDps(s) {
  let dps = 0;
  for (const w of s.player.weapons) {
    const def = WEAPONS[w.id];
    if (!def) continue;
    // Persistent zone weapons have interval≈0 — skip (they'd wildly inflate the est).
    if (def.behavior === "orbit" || def.behavior === "aura") continue;
    const sc = scaleWeapon(def, w.level);
    const interval = Math.max(0.1, (sc.interval || 1) / s.stats.cooldown);
    dps += (sc.damage * s.stats.might * sc.count) / interval;
  }
  return Math.round(dps);
}

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
  // Size the backing store from the canvas's actual CSS box (100dvh), not innerWidth/
  // Height — those diverge on mobile URL-bar collapse / rotation and stretch the field.
  const r = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width || innerWidth));
  const h = Math.max(1, Math.round(r.height || innerHeight));
  const bw = Math.floor(w * dpr);
  const bh = Math.floor(h * dpr);
  // Assigning width/height wipes the bitmap even when unchanged — and visualViewport
  // scroll fires per-frame during pinch-pan, so bail unless the size really changed.
  if (bw === canvas.width && bh === canvas.height) return;
  canvas.width = bw;
  canvas.height = bh;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  camera.resize(w, h);
}
// Synchronous on purpose: event tasks run before the loop's next rAF render, so a full
// frame is always painted after a wipe. Deferring into rAF ran AFTER that frame's
// render (the loop re-registers first), compositing a cleared canvas every resize.
addEventListener("resize", resize);
addEventListener("orientationchange", resize);
if (window.visualViewport) {
  visualViewport.addEventListener("resize", resize);
  visualViewport.addEventListener("scroll", resize);
}
resize();

const machine = makeMachine(S.BOOT);

// Persistent account state (coins, unlocks, power grid, best times, settings).
const meta = makeMeta(globalThis.localStorage);

// Accessibility: reduced-motion gating + an aria-live region for key state changes.
const liveEl = document.getElementById("Live");
function announce(msg) {
  if (liveEl) liveEl.textContent = msg;
}
const prefersReduce = !!(
  globalThis.matchMedia &&
  matchMedia("(prefers-reduced-motion: reduce)").matches
);
// Effective reduced motion: an explicit setting wins; otherwise follow the OS pref.
function reduceMotion() {
  return meta.settings.reducedMotion != null
    ? meta.settings.reducedMotion
    : prefersReduce;
}

let state = null;
let selectedCharId = STARTER_ID;
let lastSummary = { time: 0, kills: 0, level: 1, coins: 0 };
const renderer = makeRenderer(ctx);
const particles = makeParticles();
const fx = makeFx();
const hud = makeHud(hudRoot, {
  onPause,
  onSpeed: (n) => loop.setTimescale(n),
});
const sfx = makeSfx(() => meta.settings.sfx);

const input = makeInput({
  canvas,
  isPlaying: () => machine.is(S.PLAYING),
  onPause: () => {
    if (machine.is(S.PLAYING)) onPause();
    else if (machine.is(S.PAUSED)) resume();
  },
});

// Unlock/resume the AudioContext on the first user gesture (autoplay policy), then
// self-remove — no need to resume on every subsequent input.
addEventListener("pointerdown", () => sfx.unlock(), {
  passive: true,
  once: true,
});
addEventListener("keydown", () => sfx.unlock(), { once: true });

// Route drained sim events to audio + particles + screen FX.
function handleEvents() {
  const p = state.player;
  const reduce = reduceMotion();
  const shakeOn = meta.settings.shake && !reduce;
  let critShook = false; // throttle crit shake to once per drained frame
  for (const ev of state.events) {
    sfx.play(ev.type);
    switch (ev.type) {
      case "damage":
        if (meta.settings.damageNumbers && Math.random() < 0.5)
          particles.text(
            ev.x,
            ev.y - 12,
            String(ev.amount),
            "#fff",
            Math.min(11 + Math.sqrt(ev.amount), 24),
          );
        break;
      case "crit":
        if (meta.settings.damageNumbers && Math.random() < 0.7)
          particles.text(ev.x, ev.y - 14, String(ev.amount), "#ffd86e", 28);
        if (shakeOn && !critShook) {
          fx.shake(0.12);
          critShook = true;
        }
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
        // The full-screen red vignette is the main photosensitivity risk — suppress it
        // (and its shake) entirely under reduced motion.
        if (!reduce) fx.hurt(shakeOn);
        break;
      case "levelup":
        particles.ring(p.x, p.y, "#e8c14a");
        announce("Level " + (ev.level || p.level));
        break;
      case "evolve":
        particles.ring(p.x, p.y, "#9b6cff");
        particles.spark(p.x, p.y, "#b89bff", 22, 220);
        announce("Weapon evolved");
        break;
      case "explode":
        particles.spark(ev.x, ev.y, "rgba(255,140,60,0.95)", 12, 220);
        if (shakeOn) fx.shake(0.18);
        break;
      case "boss":
        if (shakeOn) fx.shake(0.7);
        announce("A boss has appeared");
        break;
      case "victory":
        particles.ring(p.x, p.y, "#e8c14a");
        announce("Victory");
        break;
      case "gameover":
        announce("You died");
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

function startRun(characterId, runLength, modifiers = {}) {
  const character = CHARACTERS[characterId] || CHARACTERS[STARTER_ID];
  state = createRunState({
    seed: (Date.now() ^ (performance.now() * 1000)) >>> 0,
    runLength,
    character,
    powerGrid: meta.powerGrid,
    modifiers,
  });
  state.prevPlays = meta.plays; // capture BEFORE recordPlay so post-run unlocks fire
  meta.recordPlay(modifiers);
  camera.follow(state.player.x, state.player.y);
  hud.resetSpeed();
  machine.set(S.PLAYING);
}

function onPause() {
  if (machine.is(S.PLAYING)) machine.set(S.PAUSED);
}
function resume() {
  if (machine.is(S.PAUSED)) machine.set(S.PLAYING);
}
function restart() {
  if (state) startRun(state.character.id, state.runLength, state.modifierSel);
}
function quitToMenu() {
  // Bank a quit-mid-run (coins / best-time / Endless score) — the only other banking
  // path is endRun(), which a quit never reaches. Guard against double-banking a
  // finished run (outcome already set → already banked by endRun).
  if (state && !state.outcome) {
    meta.bankRun(state.runLength, state.player.coins, state.time);
    if (state.endless)
      meta.recordScore(Math.floor(state.player.kills + state.time));
  }
  state = null;
  loop.setTimescale(1);
  machine.set(S.MENU);
}

function endRun() {
  const won = state.outcome === "victory";
  const prevWins = meta.wins;
  meta.bankRun(state.runLength, state.player.coins, state.time);
  if (won) meta.recordWin();
  const score = state.endless ? Math.floor(state.player.kills + state.time) : 0;
  if (state.endless) meta.recordScore(score);
  const newUnlocks = meta.newlyUnlocked(state.prevPlays, prevWins);
  lastSummary = {
    time: state.time,
    kills: state.player.kills,
    level: state.player.level,
    coins: state.player.coins,
    character: state.character,
    dps: estimateDps(state),
    endless: state.endless,
    score,
    bestScore: meta.bestScore,
    modifiers: state.modifiers.active.slice(),
    newUnlocks: newUnlocks.map((d) => ({ emoji: d.emoji, name: d.name })),
    weapons: state.player.weapons.map((w) => ({
      emoji: WEAPONS[w.id]?.emoji,
      level: w.level,
      evolved: !!WEAPONS[w.id]?.evolved,
    })),
    passives: Object.keys(state.player.passives).map((id) => ({
      emoji: PASSIVES[id]?.emoji,
      level: state.player.passives[id],
    })),
  };
  loop.setTimescale(1); // reset fast-forward when a run ends
  machine.set(won ? S.VICTORY : S.GAMEOVER);
}

// The current level-up hand is cached on the run so a banish/reroll re-render doesn't
// silently re-roll the cards the player meant to keep. Cleared after each pick.
function levelUpHand() {
  if (!state.currentChoices) state.currentChoices = levelUpChoices(state);
  return state.currentChoices;
}

function pickChoice(c) {
  applyChoice(state, c);
  state.currentChoices = null; // the next queued level-up draws a fresh hand
  if (state.awaitingLevelUp) shell.render();
  else machine.set(S.PLAYING);
}

// Randomizer modifier: resolve EVERY queued pick with a random offered card, no UI.
// Must drain to completion — bailing early would strand awaitingLevelUp=true and freeze
// the sim forever (no LevelUp screen ever opens under Randomizer).
function autoPickLevelUps() {
  let guard = 0;
  while (state.awaitingLevelUp) {
    const ch = levelUpChoices(state);
    applyChoice(state, ch[state.rollRng.range(0, ch.length - 1)]);
    if (++guard > 5000) {
      // Backstop only — never leave the run frozen; fall back to the manual screen.
      machine.set(S.LEVELUP);
      return;
    }
  }
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
      onSelect: (id) => {
        selectedCharId = id;
        machine.set(S.CONFIG);
      },
      onBack: () => machine.set(S.MENU),
    }),
  [S.CONFIG]: () =>
    ConfigScreen({
      character: selectedCharId,
      meta,
      onStart: (len, mods) => startRun(selectedCharId, len, mods),
      onBack: () => machine.set(S.SELECT),
    }),
  [S.PAUSED]: () =>
    PauseScreen({
      state,
      onResume: resume,
      onRestart: restart,
      onQuit: quitToMenu,
    }),
  [S.LEVELUP]: () =>
    LevelUpScreen({
      count: state.pendingLevelUps,
      choices: levelUpHand(),
      rerollsLeft: state.rerollsLeft,
      banishesLeft: state.banishesLeft,
      onPick: pickChoice,
      onReroll: () => {
        if (state.rerollsLeft > 0) {
          state.rerollsLeft -= 1;
          state.currentChoices = null; // reroll regenerates the whole hand
          shell.render();
        }
      },
      onBanish: (c) => {
        if (state.banishesLeft > 0 && c.id) {
          state.banishedCards.add(c.id);
          state.banishesLeft -= 1;
          // Drop only the banished card; keep the rest of the hand intact.
          if (state.currentChoices)
            state.currentChoices = state.currentChoices.filter((x) => x !== c);
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
      state.input.aim = meta.settings.manualAim
        ? input.getAim(camera, state.player)
        : null;
      stepSim(state, dt);
      handleEvents();
      particles.update(dt);
      if (state.outcome) endRun();
      else if (state.awaitingLevelUp) {
        if (state.modifiers.randomizer) autoPickLevelUps();
        else machine.set(S.LEVELUP);
      }
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
