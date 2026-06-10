// Caches are origin-scoped and SHARED with the 2D game's SW — only ever delete
// caches under OUR prefix, or the two games wipe each other on every update.
const CACHE_PREFIX = "emojisurvivors3d-";
const CACHE = CACHE_PREFIX + "v10";
const SHELL_FIRST_PARTY = [
  "./",
  "./Index.html",
  "./Manifest.webmanifest",
  // Entry point
  "./Source/Main.js",
  // Engine
  "../Shared/Engine/GameLoop.js",
  "../Shared/Engine/Rng.js",
  "../Shared/Engine/State.js",
  "../Shared/Engine/StateMachine.js",
  // World
  "../Shared/World/SpatialHash.js",
  "./Source/World/FpsCamera.js",
  "../Shared/World/Pool.js",
  // Systems
  "../Shared/Systems/Movement.js",
  "../Shared/Systems/Spawner.js",
  "../Shared/Systems/WeaponSystem.js",
  "../Shared/Systems/CombatSystem.js",
  "../Shared/Systems/PickupSystem.js",
  "../Shared/Systems/Leveling.js",
  "../Shared/Systems/StatsModel.js",
  "../Shared/Systems/Evolutions.js",
  // Content
  "../Shared/Content/Characters.js",
  "../Shared/Content/Weapons.js",
  "../Shared/Content/Passives.js",
  "../Shared/Content/Enemies.js",
  "../Shared/Content/Bosses.js",
  "../Shared/Content/PowerGrid.js",
  "../Shared/Content/Curve.js",
  "../Shared/Content/Modifiers.js",
  // Render
  "./Source/Render/Renderer3D.js",
  "./Source/Render/Particles.js",
  "./Source/Render/Fx.js",
  // Input
  "./Source/Input/FpsInput.js",
  // Audio
  "../Shared/Audio/Sfx.js",
  // Net (co-op)
  "../Shared/Net/Signal.js",
  "../Shared/Net/Rtc.js",
  "../Shared/Net/Protocol.js",
  "../Shared/Net/Coop.js",
  // Meta
  "../Shared/Meta/Save.js",
  "../Shared/Meta/Meta.js",
  "../Shared/Meta/Records.js",
  "../Shared/Meta/OnlineBoard.js",
  // UI
  "../Shared/UI/Dom.js",
  "../Shared/UI/Icons.js",
  "../Shared/UI/Shell.js",
  "../Shared/UI/Hud.js",
  "../Shared/UI/MenuScreen.js",
  "../Shared/UI/SelectScreen.js",
  "../Shared/UI/ConfigScreen.js",
  "../Shared/UI/LevelUpScreen.js",
  "../Shared/UI/PauseScreen.js",
  "../Shared/UI/ResultScreen.js",
  "../Shared/UI/ShopScreen.js",
  "../Shared/UI/SettingsScreen.js",
  "../Shared/UI/RecordsScreen.js",
  "../Shared/UI/CoopScreen.js",
  // Styles
  "../Shared/Styles/Theme.css",
  "../Shared/Styles/Reset.css",
  "../Shared/Styles/WaTheme.css",
  "../Shared/Styles/Canvas.css",
  "../Shared/Styles/Layout.css",
  "../Shared/Styles/Hud.css",
  "./Source/Styles/Fps.css",
  // Assets
  "../Shared/Assets/Icon.svg",
  "../Shared/Assets/Icon192.png",
  "../Shared/Assets/Icon512.png",
];
const SHELL_VENDOR = [
  "./Source/Vendor/Three/three.module.js",
  "./Source/Vendor/Three/three.core.js",
  "../Shared/Vendor/WebAwesome/webawesome.loader.js",
  "../Shared/Vendor/WebAwesome/styles/webawesome.css",
  "../Shared/Vendor/WebAwesome/styles/layers.css",
  "../Shared/Vendor/WebAwesome/styles/native.css",
  "../Shared/Vendor/WebAwesome/styles/utilities.css",
  "../Shared/Vendor/WebAwesome/styles/themes/default.css",
  "../Shared/Vendor/WebAwesome/styles/color/palettes/default.css",
  "../Shared/Vendor/WebAwesome/styles/color/palettes/base.css",
  "../Shared/Vendor/FontAwesome/css/fontawesome.css",
  "../Shared/Vendor/FontAwesome/css/duotone.css",
  "../Shared/Vendor/FontAwesome/webfonts/fa-duotone-900.woff2",
];
const SHELL = [...SHELL_FIRST_PARTY, ...SHELL_VENDOR];

// Many WA chunks are vendored and lazily loaded; keep the runtime ceiling high.
const MAX_RUNTIME = 300;
let runtimePuts = 0;
const SHELL_URLS = new Set(
  SHELL.map((u) => new URL(u, self.location.href).href),
);

function trim(cache) {
  return cache.keys().then((keys) => {
    const runtime = keys.filter((req) => !SHELL_URLS.has(req.url));
    const over = runtime.length - MAX_RUNTIME;
    if (over <= 0) return;
    return Promise.all(runtime.slice(0, over).map((req) => cache.delete(req)));
  });
}

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) =>
        c
          .addAll(SHELL_FIRST_PARTY)
          .then(() => Promise.allSettled(SHELL_VENDOR.map((u) => c.add(u)))),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  // The leaderboard API is live data — never cache-first or runtime-cache it.
  if (url.pathname.includes("/Api/")) return;

  // Navigations: network-first so a fresh deploy's Index.html (and thus the new module
  // graph) is picked up promptly. Falls back to the cached shell when offline.
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res && res.ok && res.type === "basic") {
            const copy = res.clone();
            caches
              .open(CACHE)
              .then((c) => c.put(e.request, copy))
              .catch(() => {});
            return res;
          }
          // Server error (e.g. mid-deploy 503): prefer the cached shell over the
          // raw error page; only surface res when nothing is cached.
          return caches
            .match(e.request)
            .then((hit) => hit || caches.match("./Index.html"))
            .then((hit) => hit || res);
        })
        .catch(() =>
          caches
            .match(e.request)
            .then((hit) => hit || caches.match("./Index.html")),
        ),
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then((hit) => {
      if (hit) return hit;
      return fetch(e.request)
        .then((res) => {
          if (res && res.ok && res.type === "basic") {
            const copy = res.clone();
            caches
              .open(CACHE)
              .then((c) =>
                c.put(e.request, copy).then(() => {
                  if (++runtimePuts % 20 === 0) return trim(c);
                }),
              )
              .catch(() => {});
          }
          return res;
        })
        .catch(() => {
          if (e.request.mode === "navigate")
            return caches.match("./Index.html");
          return Response.error();
        });
    }),
  );
});
