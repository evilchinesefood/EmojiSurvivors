# EmojiSurvivors — Design Spec

> Date: 2026-06-08 · Status: **Approved design, pre-implementation**
> Self-contained on purpose: a fresh Claude Code session with no global memory must be able to build the game from this file alone.

## 1. What this is

**EmojiSurvivors** — a lightweight, browser-based **Vampire Survivors-style** action-roguelite where every character, enemy, projectile, and pickup is an **emoji** drawn on a `<canvas>`. You pick a character, pick a run length, drop into an arena, auto-attack swarms of enemies while you dodge, level up by collecting XP, build a synergistic loadout (weapons + passives + evolutions), and survive to a final boss. Coins persist between runs to unlock characters and buy permanent upgrades.

- **Live (target):** `https://dev.jdayers.com/survivors/`
- **Repo:** `evilchinesefood/EmojiSurvivors` (GitHub, private). Default branch `main`; deploys from `main`.
- **Local:** `C:\Users\evilc\Github\EmojiSurvivors` (Windows) = `/mnt/c/Users/evilc/Github/EmojiSurvivors` (WSL).
- **Template:** built in the mold of **IdleKingdom** (`C:\Users\evilc\Github\IdleKingdom`) — same buildless/vendored/PWA/test/deploy machinery. Copy its scaffolding, not its game logic.

## 2. Locked decisions (brainstorm outcomes)

| Topic | Decision |
|---|---|
| **Scope** | Full: single run **+** win condition **+** meta-progression — all three, from the start. |
| **Controls** | Auto-attack always. Movement = **keyboard (WASD/arrows) on desktop AND pointer/touch follow on mobile** (character walks toward held pointer/finger). Both supported day one. |
| **Run length** | Player-chosen on the intro screen: **5 / 10 / 15 minutes.** Difficulty ramps continuously; a **boss** spawns at the chosen end time. Kill it = victory. |
| **Characters** | **5** characters. Each = a **starting weapon** + a **stat tilt** + a **unique passive gimmick**. **1 unlocked at first**, the other **4 bought with coins**. |
| **Upgrades** | **Weapons + passives + evolutions** (full genre depth). **~6 weapons, ~6 passives** at launch, several weapons evolve. |
| **Meta** | Coins (earned every run, win or lose) buy **character unlocks + a permanent account-wide power grid**. Catalog is **data-driven** so future stages / alt weapons / hard mode bolt on without rework. |
| **Audio** | **SFX only**, synthesized live via **WebAudio** — zero audio asset files. |
| **Rendering** | **Canvas 2D** for the arena (emoji via `ctx.fillText`); **Web Awesome + Font Awesome** for all menu/HUD chrome. Buildless ES modules, PWA. |
| **Theme** | **Spooky monster roster — LOCKED.** Cosmetic and data-driven (swappable via `Content/*`), but build the spooky set. Never stop to ask about theme. |

## 3. Tech stack & hard rules (non-negotiable)

- **Vanilla JS, native ES modules, buildless.** No framework, no bundler, no build step. Files load via `<script type="module">`.
- **PascalCase** for ALL files and directories (`GameLoop.js`, `Source/Systems/`).
- **Prettier** before finishing any task. Minimal/clean code: short names, few comments (only where logic isn't self-evident), small single-purpose functions. No type annotations/docstrings/comments on untouched code.
- **The simulation is DOM-free and headless-testable** under Node. Rendering and input are separate layers that read sim state and produce intents. (Same discipline as IdleKingdom's engine, adapted to a real-time loop.)
- **Web Awesome v3.7.0 + Font Awesome Pro Duotone, vendored + buildless** (no runtime CDN). Copy `Source/Vendor/{WebAwesome,FontAwesome}` directly from IdleKingdom — it is already vendored there. (Re-vendoring needs the FA Pro token in a gitignored `.npmrc`; copying avoids that.)
- **`core.filemode=false`** must be set on this repo (it lives on `C:\`/DrvFs; otherwise `git status` shows every file modified).

### Key differences from IdleKingdom (do NOT copy these patterns)

1. **IdleKingdom locks rendering to "intents + a 2s interval, never per-frame." EmojiSurvivors is the opposite:** it is a real-time action game and **requires a continuous `requestAnimationFrame` render loop + a fixed-timestep sim**. The "no per-frame render" rule does not apply here.
2. **IdleKingdom bans emoji in `Source/UI` (FA Duotone only).** EmojiSurvivors is *built on emoji* — emojis are the game sprites on the canvas. FA icons are for **chrome only** (buttons, stat labels, HUD icons); emojis are for **gameplay entities**. Keep that split: no emoji in the Web Awesome menu components, no FA icons as game entities.
3. No clean-path routing/router needed — EmojiSurvivors is a **single screen** (canvas + overlays). Drop IdleKingdom's `<base>`/`Router`/RewriteRule complexity; keep only `DirectoryIndex Index.html`, MIME types, and headers in `.htaccess`.

## 4. Architecture & file layout

Buildless ES modules. Sim is pure/DOM-free; render + input + UI are thin layers around it.

```
EmojiSurvivors/
  Index.html                 · canvas + overlay mounts, vendored WA/FA, manifest, SW register
  Manifest.webmanifest
  ServiceWorker.js           · cache-first, versioned CACHE, SHELL_FIRST_PARTY + SHELL_VENDOR (copy IK pattern)
  .htaccess                  · DirectoryIndex Index.html + MIME + headers (NO route rewrites)
  package.json               · { "type":"module", "scripts": { "test": "node Tests/RunAll.js && node Tests/SimProbe.mjs" } }
  .gitignore  .npmrc.example
  Source/
    Main.js                  · boot: build sim + renderer + input + UI shell, own the rAF loop
    Engine/
      GameLoop.js            · fixed-timestep accumulator (60 Hz sim) + rAF render hook + pause/timescale
      Rng.js                 · seeded PRNG (mulberry32) — determinism for probes
      State.js               · the run state container (player, entities, timers, rngs) — plain data, DOM-free
      StateMachine.js        · BOOT/MENU/SELECT/CONFIG/PLAYING/PAUSED/LEVELUP/GAMEOVER/VICTORY/SHOP transitions
    World/
      SpatialHash.js         · uniform grid; insert/query-neighbors — the collision perf backbone
      Camera.js              · follows player, world↔screen transform, viewport cull bounds
      Pool.js                · generic object pool (enemies, projectiles, gems, particles)
    Systems/                 · each: pure step(state, dt) over the sim; no DOM
      Movement.js            · player intent → velocity; enemy steering (seek player + soft separation)
      Spawner.js             · time-driven difficulty curve; tiers, waves, elites, boss-at-end
      WeaponSystem.js        · cooldowns, firing, projectile behaviors (aimed/orbit/aura/whip/lob/spread)
      CombatSystem.js        · projectile↔enemy + enemy↔player resolution via SpatialHash; i-frames; damage numbers
      PickupSystem.js        · gems/coins/chests/health/magnet; magnet vacuum; pickup radius
      Leveling.js            · XP curve, level-up trigger, 1-of-3 choice generation (Luck-weighted)
      StatsModel.js          · pure: fold character tilt + passives + power-grid → resolved stat object
      Evolutions.js          · eligibility (weapon L-max + held passive) + def swap
    Content/                 · pure data — adding content never touches Systems
      Characters.js  Weapons.js  Passives.js  Enemies.js  Bosses.js  PowerGrid.js  Curve.js
    Render/
      Renderer.js            · canvas draw: background grid, entities (fillText emoji), gems, particles, FX
      Particles.js           · hit sparks, death puffs, level-up burst, floating damage text
      Fx.js                  · screen shake, hit-flash, vignette
    Input/
      Input.js               · keyboard + pointer/touch → movement intent + pause; settings-aware
    Audio/
      Sfx.js                 · WebAudio synth: hit, kill, levelup, pickup, coin, hurt, evolve, boss, victory
    Meta/
      Save.js                · localStorage schema + versioned migration (savekey `emojisurvivors-save`)
      Meta.js                · coins, unlocked characters, power-grid levels, best times, settings
    UI/                      · Web Awesome screens + HUD; reads sim/meta, dispatches intents
      Shell.js               · owns overlay mounting + which screen is shown (from StateMachine)
      Hud.js                 · in-run: timer, level, coins, HP bar, XP bar, weapon/passive icon tray, pause btn
      MenuScreen.js          · title: Play / Shop / Settings
      SelectScreen.js        · character cards (emoji, tilt, starting weapon, passive; locked/price)
      ConfigScreen.js        · run-length picker (5/10/15)
      LevelUpScreen.js       · three choice cards (weapon/passive/evolution/stat)
      PauseScreen.js         · resume / restart / quit
      ResultScreen.js        · victory or game-over summary (time, kills, level, coins earned)
      ShopScreen.js          · character unlocks + power grid rows (level / cost / effect)
      SettingsScreen.js      · SFX volume, screen-shake toggle, damage-numbers toggle
      Icons.js               · FA Duotone helper (concept → <i>), copied/adapted from IdleKingdom
    Styles/
      Reset.css  Theme.css  WaTheme.css  Layout.css  Hud.css  Canvas.css
    Vendor/
      WebAwesome/  FontAwesome/  (copied from IdleKingdom)
    Assets/
      Icon192.png  Icon512.png
  Tests/
    Runner.js  RunAll.js     · zero-dep registered suite (copy IK Runner)
    *.Test.js                · StatsModel, Leveling, Evolutions, SpatialHash, Curve, Save migration, Spawner
    SimProbe.mjs             · seeded headless full-run probe (invariants + boss + victory)
  docs/superpowers/specs/    · this spec (rsync-excluded, like IdleKingdom)
```

## 5. Game loop & state machine

**Fixed-timestep sim, decoupled render.** `GameLoop.js` accumulates real elapsed time and steps the sim in fixed **1/60 s** increments (catch-up capped to avoid spiral-of-death), then calls render once per rAF with an interpolation alpha. Benefits: deterministic balance regardless of device frame rate, and reproducible probes.

```
loop(now):
  dt = now - last; last = now
  acc += min(dt, MAX_FRAME)        // clamp to avoid spiral of death
  while acc >= STEP:               // STEP = 1/60
    if state == PLAYING: stepSim(STEP)   // systems run only while playing
    acc -= STEP
  render(alpha = acc / STEP)       // always render (overlays draw over frozen field)
  raf(loop)
```

**States (`StateMachine.js`):**
`BOOT → MENU → SELECT → CONFIG → PLAYING`, with `PLAYING ⇄ PAUSED`, `PLAYING → LEVELUP → PLAYING` (sim frozen, cards shown), and `PLAYING → GAMEOVER | VICTORY → MENU/SHOP`. `SHOP` and `SETTINGS` reachable from `MENU`. The sim only advances in `PLAYING`; every other state freezes it and shows a Web Awesome overlay.

**Run timer:** counts up to the chosen length. The boss spawns at `length` and clears the field's normal spawns; killing it fires `VICTORY`. Dying any time fires `GAMEOVER`. Both bank coins.

## 6. Core systems

**StatsModel (pure, the heart of balance).** One function folds three layers into a resolved stat object every system reads:
`resolve(character.tilt, ownedPassives, meta.powerGrid) → { might, area, cooldown, speed, maxHp, recovery, magnet, luck, greed, growth, projCount, projSpeed, duration, armor, revives }`.
Multiplicative where it should compound (might, area, cooldown), additive where it shouldn't (projCount, revives). Nothing else hard-codes a stat — entities read the resolved object.

**Player.** Position, velocity, hp/maxHp (from stats), invuln timer (i-frames after a hit), facing (last move dir, used by directional weapons), owned weapons (id→level 1–8), owned passives (id→level), pickup/magnet radius (from stats).

**Movement.** Player: intent vector (keyboard or pointer-follow, normalized) × speed. Enemies: seek player + **soft separation** (push apart from near neighbors via SpatialHash) so swarms surround without stacking on one pixel. Cheap boids-lite, no pathfinding.

**Spawner + difficulty curve (`Spawner.js` + `Content/Curve.js`).** Curve is a pure function of elapsed time → `{ spawnInterval, simultaneousCap, enemyTierWeights, eliteChance }`. Over a run: spawn interval shrinks, tougher enemy tiers unlock and gain weight, periodic **swarm waves** (ring of weak enemies) and **elite** spawns (single fat enemy, guaranteed chest). At `t = length`, stop normal spawns and spawn the **boss** from `Content/Bosses.js`. Enemies are **pooled**.

**Collision (`SpatialHash.js` + `CombatSystem.js`).** Uniform grid keyed by `floor(x/cell), floor(y/cell)`. Each step: rebuild/refresh enemy buckets; projectiles query only their cell + neighbors; player queries its cell. This is the single most important perf system — it's what keeps 1000+ entities at 60fps. Damage applies might + weapon scaling; pierce decrements; on enemy death → drop gem (+ maybe coin/health/chest) and a death-puff particle. Player contact damage respects i-frames; armor reduces it.

**Weapons (`WeaponSystem.js` + `Content/Weapons.js`).** Each weapon ticks its own cooldown (`base / cooldownStat`). Fire behaviors (the visual variety from a small codebase):
- **aimed** — projectile(s) toward nearest enemy; `projCount`, `projSpeed`, `pierce`.
- **spread** — fan of projectiles in facing dir.
- **orbit** — N emoji orbit the player at radius, damage on contact; `duration`/count/speed scale.
- **aura** — pulsing damage zone centered on player; `area` scales radius, `cooldown` the pulse.
- **whip** — directional cone sweep (in facing dir, alternating sides); hits all enemies in arc.
- **lob** — arcs to a target cluster, AoE burst on land.
Each weapon def: `{ id, name, emoji, behavior, baseDamage, baseCooldown, area, projCount, pierce, levelScaling[1..8], evolvesTo, requiresPassive }`.

**Evolutions (`Evolutions.js`).** When a weapon hits L8 and the player holds its `requiresPassive` (any level), an **evolution card** becomes eligible in level-up rolls (and elite chests can grant it). Choosing it **swaps the weapon def** to the evolved one (bigger, new visual, new behavior tweak). Launch target: each of the ~6 weapons has one evolution.

**Pickups (`PickupSystem.js`).** XP **gems** (tiered value/color), **coins**, **health** drops, **chests** (from elites — grant 1–3 level-ups and can roll evolutions), **magnet** (vacuums all on-screen gems). Gems within magnet radius accelerate toward the player; collected → XP.

**Leveling (`Leveling.js`).** XP curve (rising per level). On level-up: freeze sim → `LEVELUP` → generate **3 choices** from eligible pool (new weapons up to a cap e.g. 6 slots, weapon level-ups, new passives up to cap, passive level-ups, eligible evolutions, and stat-up filler). **Luck** biases toward higher-value/evolution rolls and can add a 4th choice. (Reroll/banish deferred — power-grid can add rerolls later.)

**RNG (`Rng.js`).** Seeded mulberry32. The run seed is stored in state; the SimProbe fixes it for reproducibility. Separate streams for spawns vs level-up rolls so UI choices don't desync the sim.

## 7. Content (data-driven, theme = spooky default)

> Emoji choices below are the **locked spooky set**; they live in `Content/*` data (swappable later). Numbers are starting points for balancing, not final.

**Characters (`Content/Characters.js`)** — 1 free, 4 coin-unlocked:
1. **Knight 🛡️** *(free)* — Weapon: **Whip** (cone). Tilt: balanced, +10% maxHp. Passive **Stalwart**: +1 armor (flat damage reduction, min 1 taken).
2. **Mage 🧙** — Weapon: **Magic Bolt** (aimed). Tilt: +20% might, −20% maxHp (glass cannon). Passive **Arcane Echo**: 15% chance any projectile fires twice.
3. **Rogue 🗡️** — Weapon: **Daggers** (spread). Tilt: +20% speed, +15% luck. Passive **Greedy**: +30% coin gain, +1 magnet.
4. **Druid 🌿** — Weapon: **Thorn Aura** (aura). Tilt: +1 hp/s recovery, −10% speed. Passive **Regrowth**: heal 5% maxHp on each level-up.
5. **Barbarian 🪓** — Weapon: **Axe** (lob). Tilt: +25% maxHp, +15% slower cooldowns. Passive **Rage**: +1% damage per 1% missing HP.

**Weapons (`Content/Weapons.js`)** — ~6, each with an evolution:
| Weapon | Behavior | Evolves with → |
|---|---|---|
| Magic Bolt 🔵 | aimed | Spell Focus → **Bolt Storm** (ring of bolts) |
| Whip 〰️ | whip cone | Hollow Heart → **Bloodletter** (lifesteal) |
| Orbit Orbs 🔆 | orbit | Echo Stone (duration) → **Halo** (more/faster/larger) |
| Thorn Aura 🌀 | aura | Wax Candle (area) → **Inferno Ring** |
| Axe 🪓 | lob | Spinach (might) → **Meteor** |
| Daggers 🔪 | spread | Bracer (projCount) → **Fan of Knives** |

**Passives (`Content/Passives.js`)** — ~6–7 (the six evolution partners above + pure-stat ones): **Spell Focus** (−cooldown), **Hollow Heart** (+maxHp), **Echo Stone** (+duration), **Wax Candle** (+area), **Spinach** (+might), **Bracer** (+projCount), **Wings** (+speed), **Clover** (+luck), **Lodestone** (+magnet). Trim to the cleanest ~6–7 at build time.

**Enemies (`Content/Enemies.js`)** by tier (unlock over the run): 👻 Wisp (fast/frail) · 🦇 Bat (swarm) · 🧟 Zombie (slow/tanky) · 💀 Skeleton (mid) · 🕷️ Spider (fast) · 👹 Ogre (elite, drops chest). **Bosses (`Content/Bosses.js`)**: 🐲 / 👿 / 💀-king variants per run length.

**Power grid (`Content/PowerGrid.js`)** — account-wide, stackable, scaling cost: +Might, +MaxHP, +MoveSpeed, +Recovery, +Area, −Cooldown, +Luck, +Magnet, +Greed (coins), +Growth (XP), +Revive (1 extra life), +Reroll (level-up rerolls). ~12 rows, each a few levels.

## 8. Meta-progression & persistence

- **Coins bank on every run end** (win or lose) → `meta.coins`.
- **ShopScreen:** (a) **character cards** — locked ones show price + Unlock button; (b) **power grid** — one row per stat with current level / next cost / current effect, scaling cost curve.
- **Save (`Meta/Save.js`):** localStorage key `emojisurvivors-save`, **versioned with migration** (IdleKingdom pattern): `{ version, coins, unlockedCharacters[], powerGrid{stat:level}, bestTimes{5,10,15}, settings }`. Bad/old saves migrate forward, never crash.
- **Data-driven catalog** so the future C-tier (extra stages/arenas, alternate starting weapons, hard mode) is appended defs — no system changes.

## 9. UI / presentation (Web Awesome + Font Awesome)

- **Canvas** fills the viewport; camera follows the player; subtle scrolling grid background sells motion; viewport culling skips off-screen draws.
- **HUD (`Hud.js`, HTML over canvas):** top = run timer · level · coins; **HP bar** + **XP bar**; a tray of acquired weapon/passive icons; pause button. FA Duotone icons (`{noTone:true}` for contrast on dark HUD, per IK).
- **Screens (Web Awesome):** Menu (Play/Shop/Settings) → Select (character cards) → Config (5/10/15 segmented) → in-run Pause → LevelUp (3 choice cards) → Result (summary). KEY every interactive `wa-*` component; size tokens short form `s`/`m`/`l`; icons into slots via real `slot="start"`.
- **Mobile:** responsive; movement = tap/drag-follow (no on-screen stick); `dvh`/safe-area handling; everything one-handed.
- **Settings:** SFX volume, screen-shake toggle, damage-numbers toggle (persisted in save).
- **Emoji vs icons rule:** emojis only on the canvas (game entities) + character cards; FA icons only in chrome. Never mix.

## 10. Audio (`Audio/Sfx.js`)

WebAudio, synthesized at runtime (no files). Small palette of oscillator/noise blips: hit, kill, hurt, pickup-gem, coin, level-up (arpeggio), evolve (sweep), boss-spawn (low hit), victory (jingle), game-over. Respect the SFX-volume setting; lazily create the `AudioContext` on first user gesture (autoplay policy).

## 11. Testing & verification

Mirror IdleKingdom's zero-dep node harness. `npm test` runs both gates:
- **`Tests/RunAll.js`** (copy `Runner.js`) — unit suite over the pure systems: **StatsModel** (layer folding/compounding), **Leveling** (curve + 1-of-3 generation + luck), **Evolutions** (eligibility + swap), **SpatialHash** (neighbor queries), **Curve** (monotonic difficulty), **Spawner** (boss at `t=length`), **Save** (migration from older versions). Must stay green.
- **`Tests/SimProbe.mjs`** — seeded headless full run: step the sim for a complete `length` at a fixed seed with a scripted "auto-pick first choice" level-up policy and assert invariants: no `NaN`/`Infinity` in positions/stats, entity counts stay ≤ caps, player gains levels, coins accrue, **boss spawns at the deadline**, killing it sets `VICTORY`. Reproducible via the fixed seed.
- **Browser-only (human acceptance):** feel, touch, 60fps under load, Web Awesome shadow-DOM/visuals, audio. Flag these explicitly; don't claim them from node.
- Run **Prettier** on changed files before finishing each task.

## 12. Deploy (buildless rsync, copy IdleKingdom)

- **Target:** `johnayers@johndayers.com:/home/johnayers/dev.jdayers.com/survivors/`. SSH **password auth only** (`-o PreferredAuthentications=password -o PubkeyAuthentication=no`); password in WSL `~/.claude` memory `server_access.md` (not in any committed file). Use `sshpass`+`rsync` from the `/mnt/c/...` path.
- **Bump `ServiceWorker.js` `CACHE`** on every asset-touching deploy. Every first-party Source module + CSS must be in `SHELL_FIRST_PARTY`; vendor/fonts in `SHELL_VENDOR` (tolerant). **New Source files MUST be added to the SHELL list.**
- **`.htaccess`** (repo root): `DirectoryIndex Index.html`, ES-module MIME (`AddType text/javascript .js/.mjs`), `AddType font/woff2 .woff2`, manifest type, SW `no-cache`, baseline security headers. **No route rewrites** (single screen).
- **rsync excludes:** `.git/ docs/ Tests/ node_modules/ package.json package-lock.json .gitignore .npmrc .npmrc.example .omc/ CLAUDE.md AGENTS.md`.
- **Verify:** `curl -s -o /dev/null -w "%{http_code} %{content_type}\n" https://dev.jdayers.com/survivors/<asset>` — JS `text/javascript`, css `text/css`, woff2 `font/woff2`; `.npmrc` returns 404.
- **Local play:** `python3 -m http.server 8138 --directory /mnt/c/Users/evilc/Github/EmojiSurvivors` → `http://localhost:8138/Index.html`.

## 13. Build sequence (milestones)

Each milestone is independently testable; commit per task (conventional commits + `Co-Authored-By` trailer), run Prettier + tests before finishing.

- **M0 — Scaffold.** Repo + `git init` + `core.filemode=false`. Copy from IdleKingdom: `Source/Vendor/{WebAwesome,FontAwesome}`, `ServiceWorker.js` (rename CACHE → `emojisurvivors-v1`, empty SHELL to fill), `.htaccess` (strip routing), `Manifest.webmanifest`, `Tests/Runner.js`, `package.json`. Stub `Index.html` (canvas + overlay root + WA/FA links + SW register) and `Source/Main.js`. **Author the repo `CLAUDE.md`** (self-contained project guide, like IdleKingdom's). Loads to a blank canvas + a "Play" button.
- **M1 — Core loop & movement.** `GameLoop` (fixed timestep), `State`, `StateMachine`, `Rng`, `Camera`, `Input` (keyboard + pointer), `Renderer` (grid + player emoji), `Movement` (player only). Player walks around an infinite arena, camera follows. Desktop + touch.
- **M2 — Enemies & combat.** `SpatialHash`, `Pool`, `Spawner` (flat rate first), enemy steering + separation, the first weapon (aimed Magic Bolt) auto-firing, `CombatSystem`, death + gem drop. The "swarm you and you shoot back" core is fun here.
- **M3 — Leveling & build.** `PickupSystem` (gems/XP/magnet), `Leveling` (curve + LevelUpScreen 3-card pick), `StatsModel`, add 2–3 more weapons + passives, weapon leveling. The roguelite loop is now real.
- **M4 — Difficulty, boss, win/lose.** `Content/Curve` ramp, tiers/waves/elites + chests, boss-at-deadline, `ResultScreen` (victory/game-over), `Sfx`. A full timed run with an ending.
- **M5 — Evolutions & full content.** `Evolutions` + remaining weapons/passives to ~6 each, all 5 characters, `SelectScreen` + `ConfigScreen` wired. Full build variety.
- **M6 — Meta.** `Save` (versioned) + `Meta` + `ShopScreen` (character unlocks + power grid) + coins banking + best times. The between-run loop closes.
- **M7 — Polish & ship.** `Particles`/`Fx` (shake, hit-flash, damage numbers), `SettingsScreen`, mobile pass, viewport culling/perf pass at high entity counts, `SimProbe` green, SHELL complete, deploy to `/survivors/`, human browser acceptance.

## 14. Definition of Done (autonomous build = 100%)

This game is built to be completed in one autonomous run — no check-ins, no open questions. "Done" means ALL of:

- Every milestone **M0–M7** implemented; all **5 characters**, **~6 weapons + their evolutions**, **~6 passives**, **enemy tiers + bosses** for all three run lengths, full **meta/shop/power-grid**, **settings**, **WebAudio SFX**, **particles/FX**.
- **`npm test` green** (`RunAll.js` unit suite + `SimProbe.mjs` seeded full-run probe). Prettier clean on all files.
- Git history with **commit-per-task**; pushed to private **`evilchinesefood/EmojiSurvivors`** (`main`); repo **`CLAUDE.md`** authored (self-contained, IdleKingdom-style).
- **Deployed** to `https://dev.jdayers.com/survivors/` — SW `CACHE` bumped, `SHELL` complete, deploy **verified by curl** (JS `text/javascript`, css `text/css`, woff2 `font/woff2`, `.npmrc` → 404).
- The ONLY non-blocking remainder is **human browser acceptance** (subjective feel, touch, 60fps-under-load, Web Awesome visuals, audio) — document it as pending; do not fake it from node, and do not let it block reaching Done.

When ambiguity arises, take the spec's default / most reasonable option and keep going — never stop to ask.

## 15. Future (post-v1, designed-for, deferred)

- **C-tier:** extra stages/arenas, alternate starting weapons, hard mode, level-up reroll/banish. All append-only thanks to the data-driven catalog.
- Theme is **locked spooky** for v1; alternate emoji themes are a future data swap.
