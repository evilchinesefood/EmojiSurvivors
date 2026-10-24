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
- **Personal records** — saved on your device, split by length,
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
  full **gamepad** support. (Save data and personal records are shared across both versions.)

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
[Web Awesome](https://webawesome.com) + Font Awesome Pro, emojis are the canvas sprites.
Those two are paid Fonticons assets and are **not included** in this repo — see
**Vendored assets** below.

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
  Meta/     versioned localStorage save · account state · personal records
  Audio/    WebAudio SFX synth
  UI/       Web Awesome screens + HUD
  Styles/   shared CSS · Vendor/ (Web Awesome + Font Awesome — bring your own, not committed)
2d/         Index · ServiceWorker · Source/{Main, Render (canvas), Input, Camera}
3d/         Index · ServiceWorker · Source/{Main, Render (Three.js), Input (FPS), Camera, Vendor/Three}
Tests/      zero-dep unit suite + seeded sim probe
```

The co-op signaling backend lives in `Api/` and deploys with the client through
`Scripts/Deploy.sh`. Server secrets (`Api/Secret.php` — copy `Api/Secret.example.php`)
and live JSON data stores are not in the repository. Public rankings are retired:
`Api/Leaderboard.php` returns HTTP 410 for old clients without reading or changing
historical records. Personal records remain in the existing browser save.

Adding content (a new weapon, enemy, character, power-grid row) is data-only — drop a def
into `Shared/Content/*` and it bolts on without touching the systems.

## Vendored assets

This repo does **not** include Font Awesome Pro or Web Awesome — they are commercial
[Fonticons](https://fontawesome.com) products that can't be redistributed. To run the UI,
drop your own licensed copies into (both are gitignored):

- `Shared/Vendor/FontAwesome/` — Font Awesome's `css/` + `webfonts/` (Pro or Free).
- `Shared/Vendor/WebAwesome/` — a Web Awesome build.

Three.js (3D build, `3d/Source/Vendor/Three/`) is MIT-licensed and **is** included.

## License

Personal project. Font Awesome Pro and Web Awesome are commercial Fonticons products and
are **not** included here — supply your own under your own license (see Vendored assets).

Built with [Claude Code](https://claude.com/claude-code).

## Security checks and deployment

Co-op uses six-character room codes and server-issued private peer tokens. The room code invites guests; each peer token authorizes that peer’s messages and polling. Authenticated retries reuse the guest identity. Pending joins expire after 45 seconds, with at most 12 per room and 3 per IP; guest traffic cannot extend their lifetime or the room lifetime. Only the host can confirm up to three connected guests, renewing their 90-second signaling leases every 15 seconds while the lobby is open. Leaving releases a guest identity; the host releases disconnected guests and closes its room on exit. Once a run starts, gameplay stays P2P and does not require signaling leases.

Refresh all players’ tabs and create a new lobby after this update so every player has the lifecycle-aware client. Existing token hashes are preserved when signaling metadata is added. Browser saves, personal records, historical leaderboard JSON, and server secrets are preserved; the deployment does not migrate or delete them.

Run `npm run test:security` with PHP and Node installed for temporary-storage authorization tests, in addition to `npm test`. `bash Scripts/Deploy.sh` runs both and previews deployment; add `--live` to deploy. It preserves server secrets, live JSON stores, and licensed assets absent locally, and sets files/directories to 0644/0755. Service-worker cache versions must be bumped when cached client files change.
