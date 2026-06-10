// Boot orchestrator: builds sim + 3D renderer + FPS input + HUD + UI shell, owns
// the rAF loop, and routes state-machine transitions. The sim only advances while
// PLAYING; every other state freezes it and the shell shows an overlay. The sim is
// the same plane-based survivors core — this layer views it first-person: pointer-
// lock mouse look, camera-relative WASD, weapons firing where you aim.
import { S, makeMachine } from "../../Shared/Engine/StateMachine.js";
import { createRunState } from "../../Shared/Engine/State.js";
import { stepSim, createLoop } from "../../Shared/Engine/GameLoop.js";
import { makeFpsCamera } from "./World/FpsCamera.js";
import { makeRenderer3D } from "./Render/Renderer3D.js";
import { makeParticles } from "./Render/Particles.js";
import { makeFx } from "./Render/Fx.js";
import { makeFpsInput } from "./Input/FpsInput.js";
import { makeHud } from "../../Shared/UI/Hud.js";
import { makeShell } from "../../Shared/UI/Shell.js";
import { mount } from "../../Shared/UI/Dom.js";
import { MenuScreen } from "../../Shared/UI/MenuScreen.js";
import { SelectScreen } from "../../Shared/UI/SelectScreen.js";
import { RecordsScreen } from "../../Shared/UI/RecordsScreen.js";
import { postRun } from "../../Shared/Meta/OnlineBoard.js";
import { ConfigScreen } from "../../Shared/UI/ConfigScreen.js";
import { PauseScreen } from "../../Shared/UI/PauseScreen.js";
import { LevelUpScreen } from "../../Shared/UI/LevelUpScreen.js";
import { ResultScreen } from "../../Shared/UI/ResultScreen.js";
import { ShopScreen } from "../../Shared/UI/ShopScreen.js";
import { SettingsScreen } from "../../Shared/UI/SettingsScreen.js";
import { CoopScreen, GuestPauseScreen } from "../../Shared/UI/CoopScreen.js";
import { makeCoop } from "../../Shared/Net/Coop.js";
import { levelUpChoices, applyChoice } from "../../Shared/Systems/Leveling.js";
import { makeSfx } from "../../Shared/Audio/Sfx.js";
import { makeMeta } from "../../Shared/Meta/Meta.js";
import { CHARACTERS, STARTER_ID } from "../../Shared/Content/Characters.js";
import { WEAPONS, scaleWeapon } from "../../Shared/Content/Weapons.js";
import { PASSIVES } from "../../Shared/Content/Passives.js";

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

// A new SW (skipWaiting + clients.claim) takes control mid-session after a deploy. The
// page still holds the OLD modules in memory → reload once to pick up the fresh,
// consistent bundle (prevents stale-overlay / mixed-version bugs). But NEVER nuke an
// active run: reload only when idle (no run), else defer until the run ends.
let pendingReload = false;
function reloadForUpdate() {
  if (pendingReload) location.reload();
}
if ("serviceWorker" in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || pendingReload) return; // skip first-ever control; once only
    pendingReload = true;
    if (!state) reloadForUpdate(); // idle → reload now; mid-run → quitToMenu() handles it
  });
  addEventListener("load", () =>
    navigator.serviceWorker.register("./ServiceWorker.js").catch(() => {}),
  );
}

const canvas = document.getElementById("Game");
const hudRoot = document.getElementById("Hud");
const overlay = document.getElementById("Overlay");
const crosshairEl = document.getElementById("Crosshair");
const vignetteEl = document.getElementById("Vignette");
const viewmodelEl = document.getElementById("Viewmodel");
const hornsEl = document.getElementById("Horns");
const fireBtnEl = document.getElementById("FireBtn");
const coopToastEl = document.getElementById("CoopToast");
const coarsePointer = !!(
  globalThis.matchMedia && matchMedia("(pointer: coarse)").matches
);

const camera = makeFpsCamera();
const renderer = makeRenderer3D(canvas);
function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  // Size from the canvas's actual CSS box (100dvh), not innerWidth/Height — those
  // diverge on mobile URL-bar collapse / rotation and stretch the field.
  const r = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width || innerWidth));
  const h = Math.max(1, Math.round(r.height || innerHeight));
  if (w === camera.w && h === camera.h && canvas.width === Math.floor(w * dpr))
    return;
  renderer.resize(w, h, dpr);
  camera.resize(w, h);
}
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
let guestRun = null; // co-op guest mode: no local sim, render the host's ghost
let lastGhostHp = Infinity;
let selectedCharId = STARTER_ID;
let lastSummary = { time: 0, kills: 0, level: 1, coins: 0 };
let quack = false; // Konami easter egg — ducks until the next Play
let pacifistShown = false;

// Date-based seasonal flags, computed once at boot and passed into the sim as a
// run input (tests pass nothing → both false → streams untouched).
const bootDay = new Date();
const seasonal = {
  halloween: bootDay.getMonth() === 9 && bootDay.getDate() === 31,
  friday13: bootDay.getDay() === 5 && bootDay.getDate() === 13,
};
const particles = makeParticles();
const fx = makeFx(vignetteEl);
const coop = makeCoop("3d");
let ctrlToastMsg = "";
function refreshToast(downed) {
  const msg = downed ? "💀 Down — respawning…" : ctrlToastMsg;
  if (coopToastEl.textContent !== msg) coopToastEl.textContent = msg;
  coopToastEl.hidden = !msg;
}
const hud = makeHud(hudRoot, {
  onPause,
  onSpeed: (n) => loop.setTimescale(n),
});
const sfx = makeSfx(() => meta.settings.sfx);

const input = makeFpsInput({
  canvas,
  camera,
  isPlaying: () => machine.is(S.PLAYING),
  onPause: () => {
    if (machine.is(S.PLAYING)) onPause();
    else if (machine.is(S.PAUSED)) resume();
  },
  sensitivity: () => meta.settings.sensitivity ?? 1,
  fireBtn: fireBtnEl,
});

// Pointer lock follows the run: lock whenever we enter PLAYING (always from a user
// gesture — start/resume/level-up clicks or the P key), release everywhere else so
// menu cursors work. A plain canvas click mid-run re-locks after a stray unlock.
machine.onChange((s, prev) => {
  if (s === S.PLAYING) input.lock();
  else input.unlock();
  // Co-op host: tell guests when the sim freezes for a level-up / pause.
  if (coop.isHost() && state) {
    if (s === S.LEVELUP) coop.hostNotify({ t: "lu", open: 1 });
    else if (prev === S.LEVELUP) coop.hostNotify({ t: "lu", open: 0 });
    if (s === S.PAUSED) coop.hostNotify({ t: "pause", open: 1 });
    else if (prev === S.PAUSED) coop.hostNotify({ t: "pause", open: 0 });
  }
});
canvas.addEventListener("pointerdown", (e) => {
  if (e.pointerType === "mouse" && machine.is(S.PLAYING)) input.lock();
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
    // Clown Mode: every kill honks. The cheater earned this.
    sfx.play(state.tainted && ev.type === "kill" ? "honk" : ev.type);
    switch (ev.type) {
      case "damage":
        if (meta.settings.damageNumbers && Math.random() < 0.5)
          particles.text(
            ev.x,
            ev.y,
            String(ev.amount),
            "#fff",
            Math.min(11 + Math.sqrt(ev.amount), 24),
          );
        break;
      case "crit":
        if (meta.settings.damageNumbers && Math.random() < 0.7)
          particles.text(ev.x, ev.y, String(ev.amount), "#ffd86e", 28);
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
      case "dodge":
        particles.text(p.x, p.y, "💨", "#9a8fb0", 14);
        break;
      case "disco": {
        for (const c of ["#ff5a8a", "#ffd23e", "#74e04a", "#46a6ff", "#b89bff"])
          particles.spark(ev.x, ev.y, c, 8, 240);
        particles.ring(ev.x, ev.y, "#ffd23e");
        break;
      }
      case "karen":
        particles.text(
          ev.x,
          ev.y,
          "let me speak to your manager!",
          "#e8c14a",
          12,
        );
        break;
      case "mimic":
        particles.text(ev.x, ev.y, "😏", "#e8c14a", 16);
        break;
      case "devil":
        particles.text(ev.x, ev.y, "666", "#c0354a", 22);
        announce("666");
        break;
      case "whisper": {
        const lines = [
          "nice save file",
          "we know",
          "👁️",
          "interesting coins you have",
          "the game knows",
        ];
        particles.text(
          ev.x,
          ev.y,
          lines[(Math.random() * lines.length) | 0],
          "#9a8fb0",
          12,
        );
        break;
      }
      case "reap":
        particles.text(ev.x, ev.y, "☠️", "#b89bff", 14);
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

// First-person chrome: crosshair + weapon viewmodel show only during a live run.
// `vs` is whichever view-state is on screen: the host sim or a guest ghost.
let vmEmoji = "";
function updateFpsChrome(vs) {
  const live = !!vs && machine.is(S.PLAYING);
  crosshairEl.hidden = !live;
  viewmodelEl.hidden = !live;
  fireBtnEl.hidden = !(live && coarsePointer);
  if (!live) {
    hornsEl.hidden = true;
    return;
  }
  const p = vs.player;
  const def = WEAPONS[p.weapons[0]?.id];
  const em = vs.tainted ? "🤡" : def ? def.emoji : "🙂";
  if (em !== vmEmoji) {
    vmEmoji = em;
    viewmodelEl.textContent = em;
  }
  const frac = Math.min(1, Math.hypot(p.vx, p.vy) / (vs.stats.speed || 1));
  const bx = Math.sin(vs.time * 5.2) * 9 * frac;
  const by = Math.abs(Math.cos(vs.time * 5.2)) * 7 * frac;
  viewmodelEl.style.transform = `translate(${bx}px, ${-by}px) rotate(${bx * 0.6}deg)`;
  // Kill #666 horns hover above the crosshair, fading out over the final second.
  hornsEl.hidden = !(vs.devil > 0);
  if (vs.devil > 0) hornsEl.style.opacity = String(Math.min(1, vs.devil));
}

function startRun(characterId, runLength, modifiers = {}) {
  const character = CHARACTERS[characterId] || CHARACTERS[STARTER_ID];
  state = createRunState({
    seed: (Date.now() ^ (performance.now() * 1000)) >>> 0,
    runLength,
    character,
    powerGrid: meta.powerGrid,
    modifiers,
    tainted: meta.tainted,
    seasonal,
  });
  pacifistShown = false;
  state.prevPlays = meta.plays; // capture BEFORE recordPlay so post-run unlocks fire
  meta.recordPlay(modifiers);
  camera.follow(state.player.x, state.player.y);
  camera.reset();
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
// Snapshot the live run as a leaderboard entry. Standard quits are NOT recorded
// (abandoned-run noise); Endless quits are — quitting is Endless's cash-out.
function runEntry(won, score) {
  return {
    date: Date.now(),
    runLength: state.runLength,
    endless: state.endless,
    hard: state.modifiers.active.includes("hard"),
    won,
    score,
    time: Math.floor(state.time),
    kills: state.player.kills,
    level: state.player.level,
    character: state.character.id,
    mods: state.modifiers.active.slice(),
  };
}

function submitEntry(entry) {
  meta.recordEntry(entry);
  if (!meta.tainted) postRun(entry, meta.playerName);
}

function guestQuit() {
  coop.guestLeave();
  guestRun = null;
  ctrlToastMsg = "";
  refreshToast(false);
  loop.setTimescale(1);
  machine.set(S.MENU);
  reloadForUpdate(); // apply a deferred post-deploy update, same as quitToMenu
}

function quitToMenu() {
  // Co-op host bailing mid-run ends the run for everyone.
  if (coop.isHost()) {
    if (state && !state.outcome)
      coop.hostNotify({
        t: "end",
        victory: false,
        time: Math.floor(state.time),
        kills: state.player.kills,
        level: state.player.level,
      });
    coop.shutdown();
  }
  // Bank a quit-mid-run (coins / best-time / Endless score) — the only other banking
  // path is endRun(), which a quit never reaches. Guard against double-banking a
  // finished run (outcome already set → already banked by endRun).
  if (state && !state.outcome) {
    meta.bankRun(state.runLength, state.player.coins, state.time);
    if (state.endless) {
      const score = Math.floor(state.player.kills + state.time);
      meta.recordScore(score);
      submitEntry(runEntry(false, score));
    }
  }
  state = null;
  loop.setTimescale(1);
  machine.set(S.MENU);
  reloadForUpdate(); // apply a deferred post-deploy update now that no run is active
}

function endRun() {
  const won = state.outcome === "victory";
  const prevWins = meta.wins;
  meta.bankRun(state.runLength, state.player.coins, state.time);
  if (won) meta.recordWin();
  const score = state.endless ? Math.floor(state.player.kills + state.time) : 0;
  if (state.endless) meta.recordScore(score);
  submitEntry(runEntry(won, score));
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
    tainted: state.tainted,
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
  if (coop.isHost()) {
    coop.hostNotify({
      t: "end",
      victory: won,
      time: Math.floor(lastSummary.time),
      kills: lastSummary.kills,
      level: lastSummary.level,
    });
    coop.shutdown();
  }
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
  // A locked filler now auto-resolves any remaining dead-pool level-ups silently.
  if (state.awaitingLevelUp && state.autoFiller) drainLockedFillers();
  if (state.awaitingLevelUp) shell.render();
  else machine.set(S.PLAYING);
}

const isAllFiller = (hand) =>
  hand.every((c) => c.kind === "heal" || c.kind === "coins");

// Once the player locks a filler (Feast/Coin Cache), every later level-up whose hand
// is nothing but fillers auto-applies it — no repeated identical prompt. Stops (and
// caches the hand) the moment a real upgrade reappears, so the screen still shows then.
function drainLockedFillers() {
  let guard = 0;
  while (state.awaitingLevelUp) {
    const hand = levelUpChoices(state);
    if (!isAllFiller(hand)) {
      state.currentChoices = hand;
      return;
    }
    applyChoice(state, { kind: state.autoFiller });
    if (++guard > 5000) return;
  }
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
      seasonal,
      quack,
      title: "EmojiSurvivors 3D",
      onPlay: () => {
        quack = false;
        machine.set(S.SELECT);
      },
      onCoop: () => machine.set(S.COOP),
      onShop: () => machine.set(S.SHOP),
      onRecords: () => machine.set(S.RECORDS),
      onSettings: () => machine.set(S.SETTINGS),
    }),
  [S.SHOP]: () =>
    ShopScreen({
      meta,
      onBack: () => machine.set(S.MENU),
      refresh: () => shell.render(),
    }),
  [S.SETTINGS]: () =>
    SettingsScreen({ meta, fps: true, onBack: () => machine.set(S.MENU) }),
  [S.RECORDS]: () => RecordsScreen({ meta, onBack: () => machine.set(S.MENU) }),
  [S.SELECT]: () =>
    SelectScreen({
      meta,
      onSelect: (id) => {
        selectedCharId = id;
        machine.set(S.CONFIG);
      },
      onBack: () => machine.set(S.MENU),
      refresh: () => shell.render(),
    }),
  [S.CONFIG]: () =>
    ConfigScreen({
      character: selectedCharId,
      meta,
      onStart: (len, mods) => startRun(selectedCharId, len, mods),
      onBack: () => machine.set(S.SELECT),
    }),
  [S.PAUSED]: () =>
    state
      ? PauseScreen({
          state,
          meta,
          onResume: resume,
          onRestart: restart,
          onQuit: quitToMenu,
        })
      : GuestPauseScreen({ onResume: resume, onLeave: guestQuit }),
  [S.COOP]: () =>
    CoopScreen({
      coop,
      meta,
      runLength: coopRunLength,
      refresh: () => shell.render(),
      onBack: () => machine.set(S.MENU),
      onStart: (len) => {
        startRun(coop.myChar, len, {});
        coop.hostAttach(state, len);
      },
    }),
  [S.LEVELUP]: () => (state ? hostLevelUpScreen() : guestLevelUpScreen()),
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

// Co-op guest: the host dealt this hand (ctrl {t:"choices"}); the pick goes back
// as an index and the host applies it to our ally.
function guestLevelUpScreen() {
  const hand = (coop.guestHand() || []).map((c, i) => ({
    kind: c.k,
    id: c.id,
    emoji: c.e,
    label: c.n,
    desc: c.d,
    _i: i,
  }));
  const pick = (c) => {
    coop.guestPick(c._i);
    if (!coop.guestHand() && machine.is(S.LEVELUP)) machine.set(S.PLAYING);
    else shell.render();
  };
  return LevelUpScreen({
    count: 1,
    choices: hand,
    rerollsLeft: 0,
    banishesLeft: 0,
    onPick: pick,
    onLock: pick,
    onReroll: () => {},
    onBanish: () => {},
  });
}

function hostLevelUpScreen() {
  return LevelUpScreen({
    count: state.pendingLevelUps,
    choices: levelUpHand(),
    rerollsLeft: state.rerollsLeft,
    banishesLeft: state.banishesLeft,
    onPick: pickChoice,
    onLock: (c) => {
      state.autoFiller = c.kind; // lock this filler, then take it now
      pickChoice(c);
    },
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
  });
}

const coopRunLength = { value: 600 };
const shell = makeShell({ overlay, hud, machine, screens });

// ── Co-op callbacks (need shell/machine/meta live).
coop.onToast = (m) => {
  ctrlToastMsg = m || "";
  refreshToast(false);
};
coop.onLobby = () => {
  if (machine.is(S.COOP)) shell.render();
};
// Guest upgrade hands: open our own LevelUp screen when one arrives, close it
// when the pick is sent (or re-render if another hand is already queued).
coop.onChoices = () => {
  if (!guestRun) return;
  if (coop.guestHand()) {
    if (machine.is(S.PLAYING)) machine.set(S.LEVELUP);
    else if (machine.is(S.LEVELUP)) shell.render();
  } else if (machine.is(S.LEVELUP)) machine.set(S.PLAYING);
};
coop.onStart = (info) => {
  meta.recordPlay({});
  guestRun = { runLength: info.runLength };
  lastGhostHp = Infinity;
  hud.resetSpeed();
  camera.reset();
  machine.set(S.PLAYING);
  // The start arrived over the network (no user gesture), so the browser denies
  // the pointer-lock request — without a hint the mouse just feels dead.
  if (!coarsePointer && document.pointerLockElement !== canvas) {
    ctrlToastMsg = "🖱️ Click to capture the mouse";
    refreshToast(false);
  }
};
document.addEventListener("pointerlockchange", () => {
  if (document.pointerLockElement === canvas && ctrlToastMsg.startsWith("🖱️")) {
    ctrlToastMsg = "";
    refreshToast(false);
  }
});
coop.onEnd = ({ victory, time, kills, level }) => {
  if (!guestRun) return;
  const coins = coop.myCoins();
  meta.bankRun(guestRun.runLength, coins, time);
  if (victory) meta.recordWin();
  const wid = CHARACTERS[coop.myChar]?.weapon;
  lastSummary = {
    time,
    kills,
    level,
    coins,
    character: CHARACTERS[coop.myChar],
    dps: 0,
    endless: false,
    score: 0,
    bestScore: meta.bestScore,
    tainted: false,
    modifiers: [],
    newUnlocks: [],
    weapons: wid
      ? [{ emoji: WEAPONS[wid]?.emoji, level: 1, evolved: false }]
      : [],
    passives: [],
  };
  guestRun = null;
  coop.shutdown();
  ctrlToastMsg = "";
  refreshToast(false);
  machine.set(victory ? S.VICTORY : S.GAMEOVER);
};
coop.onClose = (reason) => {
  if (guestRun) {
    guestRun = null;
    ctrlToastMsg = "";
    refreshToast(false);
    machine.set(S.MENU);
    announce(reason || "Disconnected");
  } else if (machine.is(S.COOP)) shell.render();
};

// Konami code on any screen → the menu goes full duck until the next Play.
const KONAMI =
  "ArrowUp,ArrowUp,ArrowDown,ArrowDown,ArrowLeft,ArrowRight,ArrowLeft,ArrowRight,b,a".split(
    ",",
  );
let konamiI = 0;
addEventListener("keydown", (e) => {
  konamiI =
    e.key === KONAMI[konamiI] ? konamiI + 1 : e.key === KONAMI[0] ? 1 : 0;
  if (konamiI === KONAMI.length) {
    konamiI = 0;
    quack = true;
    if (machine.is(S.MENU)) shell.render();
  }
});

const loop = createLoop(
  (dt) => {
    input.update(dt); // gamepad poll — every state, so Start can pause AND resume
    if (machine.is(S.PLAYING) && guestRun) {
      // Co-op guest: no local sim — predict own movement, stream input up.
      const intent = input.getIntent(camera);
      coop.guestPredict(dt, intent);
      coop.guestInput(
        intent,
        camera.planeForward(),
        meta.settings.autoFire ? true : input.getFire(),
      );
      particles.update(dt);
    } else if (machine.is(S.PLAYING) && state) {
      state.input.move = input.getIntent(camera);
      state.input.aim = camera.planeForward(); // weapons fire where you look
      // Auto Fire setting restores always-on weapons; otherwise hold the trigger.
      state.input.fire = meta.settings.autoFire ? true : input.getFire();
      if (coop.isHost()) coop.hostTick(state); // guests' inputs -> allies
      stepSim(state, dt);
      handleEvents();
      if (coop.isHost()) coop.hostFlush(state); // ~20Hz snapshot broadcast
      if (!pacifistShown && state.time >= 60 && state.player.kills === 0) {
        pacifistShown = true;
        particles.text(
          state.player.x,
          state.player.y,
          "pacifist run? 🕊️",
          "#9a8fb0",
          13,
        );
      }
      particles.update(dt);
      if (state.outcome) endRun();
      else if (state.awaitingLevelUp) {
        if (state.modifiers.randomizer) autoPickLevelUps();
        else {
          if (state.autoFiller) drainLockedFillers();
          if (state.awaitingLevelUp) machine.set(S.LEVELUP);
        }
      }
    }
    // Decay shake every frame (even paused/overlay) so frozen frames settle.
    fx.update(dt);
  },
  () => {
    if (state) {
      // Safety net: a live run must never sit under a leftover overlay (results,
      // level-up, etc.). Overlays belong to LEVELUP/PAUSED/result states; during
      // PLAYING the overlay should always be empty.
      if (machine.is(S.PLAYING) && overlay.firstChild) mount(overlay, null);
      camera.follow(state.player.x, state.player.y);
      const shakeOn = meta.settings.shake && !reduceMotion();
      renderer.render(state, camera, particles, shakeOn ? fx.offset() : null);
      hud.update(state, trayItems());
      updateFpsChrome(state);
    } else if (guestRun) {
      const ghost = coop.ghost();
      if (ghost) {
        if (machine.is(S.PLAYING) && overlay.firstChild) mount(overlay, null);
        camera.follow(ghost.player.x, ghost.player.y);
        // own-HP drop is the guest's hurt feedback (events stay host-side)
        if (ghost.player.hp < lastGhostHp - 0.5) {
          sfx.play("hurt");
          if (!reduceMotion()) fx.hurt(meta.settings.shake);
        }
        lastGhostHp = ghost.player.hp;
        refreshToast(!!ghost.downedSelf);
        const shakeOn = meta.settings.shake && !reduceMotion();
        renderer.render(ghost, camera, particles, shakeOn ? fx.offset() : null);
        hud.update(ghost, coop.guestTray());
        updateFpsChrome(ghost);
      } else {
        updateFpsChrome(null); // joined but no snapshot yet
      }
    } else {
      // Menu backdrop: drift the camera through the graveyard. Wall-clock based
      // (rAF rate varies); the gap guard skips stale deltas after a run.
      const now = performance.now() / 1000;
      if (now - driftLast < 1) driftT += (now - driftLast) * 36;
      driftLast = now;
      camera.follow(driftT, driftT);
      camera.yaw = -Math.PI * 0.75; // face along the (+x,+y) drift
      camera.pitch = -0.05;
      renderer.background(camera);
      updateFpsChrome(null);
    }
  },
);
let driftT = 0;
let driftLast = 0;
loop.start();
machine.set(S.MENU);
