# EmojiSurvivors 💀

A spooky, browser-based **Vampire Survivors-style** bullet-heaven roguelite where every
character, monster, projectile, and pickup is an **emoji**. Ships in **two flavors from
one codebase** — a top-down 2D canvas game and a first-person 3D (Three.js) rewrite that
shares the exact same simulation.

**▶ Play: https://dev.jdayers.com/survivors/** — pick **2D Classic** or **3D FPS**.

Pick a survivor, choose how long you dare to last, then auto-attack endless swarms while
you dodge, level up, and stitch together a synergistic loadout — until the boss shows up
at the deadline. Coins persist between runs to power up your account.

## Features

- **10 characters** — six free (knight, mage, rogue, druid, barbarian, necromancer) and
  four coin-unlocked (witch, ninja, pumpkin king, reaper). Each has a starting weapon, a
  stat tilt, and a unique gimmick: glass-cannon double-fire, missing-HP rage, regen,
  greed, armor, life-on-hit, 4-card draws, dodge, attacker-reflect, low-HP execute.
- **11 weapons + their evolutions** — aimed bolts, dagger spreads, a whip cone, a thorn
  aura, lobbed axes, orbiting orbs, throwing stars, a moon scythe, a pumpkin bomb, bone
  spears — each evolves at max level when paired with its partner passive.
- **10 passives** and a **17-row account-wide power grid** (permanent, coin-bought),
  including an **infinite Ascension** row so coins always have a use.
- **Enemy tiers** that unlock as the run heats up, **elites** that drop chests, and a
  **boss per run length** — **5 / 10 / 15 / 30 min**. Kill it to win.
- **Leaderboards** — local records plus an opt-in online global board, split by length,
  standard/endless, and normal/hard.
- **Modifiers** including **Hard Mode** (roughly triple the threat — standing still is
  fatal), Endless, and a stack of run mutators, unlocked by playing and winning.
- **Hidden easter eggs** — disco wisps, a fast-talking Karen, mimic chests, a graveyard
  cat, a Konami secret, seasonal surprises, and more. Edit your save and… find out.
- 1-of-3 (luck → 4) **level-up draws** with banish + reroll, XP gems, magnet, chests,
  revives. **WebAudio SFX** synthesized at runtime (zero audio files), particles, screen
  shake, and a drifting graveyard backdrop. Installable **PWA**, fully offline.
- **Two dimensions, one sim** — a 2D top-down build and a 3D first-person build (mouse-look,
  trigger fire, an instanced billboard world) that runs the identical engine.
- **4-player online co-op** — host-authoritative WebRTC P2P with per-player level-ups, plus
  full **gamepad** support. (Save data and leaderboards are shared across both versions.)

## Controls

- **2D desktop:** WASD / arrow keys to move. `Esc` / `P` to pause. Attacks are automatic.
- **2D mobile:** hold/drag anywhere — your survivor walks toward your finger. One-handed.
- **3D:** mouse-look + WASD, click to fire (or Auto Fire); touch has a dual-zone stick + look.
- **Gamepad:** left stick moves, right stick aims/looks, trigger fires, Start pauses.

## Tech

Vanilla **ES modules, buildless** (no framework, no bundler, no build step). The
simulation is a DOM-free, deterministic **fixed-timestep (60 Hz) engine** decoupled from a
per-frame `requestAnimationFrame` canvas renderer — so balance is frame-rate independent
and the whole game is headless-testable under Node. Menu/HUD chrome is
[Web Awesome](https://webawesome.com) + Font Awesome (vendored), emojis are the canvas
sprites.

## Project layout

One tree, one deploy — the renderer-agnostic core lives in `Shared/`, and the two version
folders only carry their renderer, input, camera, and shell.

```
Index.html    version picker (2D Classic / 3D FPS)
Shared/
  Engine/   fixed-timestep loop · seeded RNG · run state · state machine
  World/    spatial hash (collision) · object pool
  Systems/  movement · spawner · weapons · combat · pickups · leveling · stats · evolutions   (pure, DOM-free)
  Content/  characters · weapons · passives · enemies · bosses · power grid · curves          (data-driven)
  Net/      WebRTC co-op — signaling · peer · binary snapshot protocol · session
  Meta/     versioned localStorage save · account state · local + online leaderboards
  Audio/    WebAudio SFX synth
  UI/       Web Awesome screens + HUD
  Styles/   shared CSS · Vendor/ (Web Awesome + Font Awesome)
2d/         Index · ServiceWorker · Source/{Main, Render (canvas), Input, Camera}
3d/         Index · ServiceWorker · Source/{Main, Render (Three.js), Input (FPS), Camera, Vendor/Three}
Tests/      zero-dep unit suite + seeded sim probe
```

The PHP backends (online leaderboard + co-op signaling) live in `Api/` on the server and
are **deployed separately via rsync — they are not part of this repository**.

Adding content (a new weapon, enemy, character, power-grid row) is data-only — drop a def
into `Shared/Content/*` and it bolts on without touching the systems.

## License

Personal project. Web Awesome and Font Awesome are vendored under their own licenses.

Built with [Claude Code](https://claude.com/claude-code).
