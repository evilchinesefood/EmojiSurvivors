# EmojiSurvivors 💀

A spooky, browser-based **Vampire Survivors-style** bullet-heaven roguelite where every
character, monster, projectile, and pickup is an **emoji** drawn on a `<canvas>`.

**▶ Play: https://dev.jdayers.com/survivors/**

Pick a survivor, choose how long you dare to last, then auto-attack endless swarms while
you dodge, level up, and stitch together a synergistic loadout — until the boss shows up
at the deadline. Coins persist between runs to power up your account.

## Features

- **5 characters**, each with a starting weapon, a stat tilt, and a unique gimmick
  (glass-cannon double-fire, missing-HP rage, regen, greed, armor).
- **6 weapons + 6 evolutions** — aimed bolts, dagger spreads, a whip cone, a thorn aura,
  lobbed axes, orbiting orbs — each evolves at max level when paired with its passive.
- **7 passives** and a **12-row account-wide power grid** (permanent, coin-bought).
- **6 enemy tiers** that unlock as the run heats up, **elites** that drop chests, and a
  **boss per run length** (5 / 10 / 15 min). Kill it to win.
- 1-of-3 (luck → 4) **level-up draws**, XP gems, magnet, chests, revives, rerolls.
- **WebAudio SFX** synthesized at runtime (zero audio files), particles, screen shake,
  a moody graveyard backdrop (drifting fog, scattered tombstones, vignette).
- Installable **PWA**, fully offline after first load.

## Controls

- **Desktop:** WASD / arrow keys to move. `Esc` / `P` to pause. Attacks are automatic.
- **Mobile:** hold/drag anywhere — your survivor walks toward your finger. One-handed.

## Tech

Vanilla **ES modules, buildless** (no framework, no bundler, no build step). The
simulation is a DOM-free, deterministic **fixed-timestep (60 Hz) engine** decoupled from a
per-frame `requestAnimationFrame` canvas renderer — so balance is frame-rate independent
and the whole game is headless-testable under Node. Menu/HUD chrome is
[Web Awesome](https://webawesome.com) + Font Awesome (vendored), emojis are the canvas
sprites.

## Develop

```bash
# serve locally (any static server works)
python3 -m http.server 8138 --directory .
# → http://localhost:8138/Index.html

# run the test suite (zero-dependency, Node only)
npm test            # Tests/RunAll.js (unit) + Tests/SimProbe.mjs (seeded full-run probe)

node Tests/BalanceProbe.mjs 900   # optional: per-character balance sweep at a run length
```

`SimProbe.mjs` drives the headless sim at a fixed seed and asserts the real invariants:
no NaN, bounded entity counts, the player levels up, the boss spawns at the deadline, a
focused build evolves, and a run reaches **victory** at 5- and 15-minute lengths.

## Project layout

```
Source/
  Engine/   fixed-timestep loop · seeded RNG · run state · state machine
  World/    spatial hash (collision) · camera · object pool
  Systems/  movement · spawner · weapons · combat · pickups · leveling · stats · evolutions   (pure, DOM-free)
  Content/  characters · weapons · passives · enemies · bosses · power grid · curves          (data-driven)
  Render/   canvas renderer · particles · FX
  Input/    keyboard + pointer/touch
  Audio/    WebAudio SFX synth
  Meta/     versioned localStorage save + account state
  UI/       Web Awesome screens + HUD
Tests/      zero-dep unit suite + seeded sim probe
```

Adding content (a new weapon, enemy, character, power-grid row) is data-only — drop a def
into `Source/Content/*` and it bolts on without touching the systems.

## License

Personal project. Web Awesome and Font Awesome are vendored under their own licenses.

Built with [Claude Code](https://claude.com/claude-code).
