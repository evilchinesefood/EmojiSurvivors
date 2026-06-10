// Caches are origin-scoped and SHARED with the 3D game's SW — only ever delete
// our own caches (NOT emojisurvivors3d-*), or the two games wipe each other.
const CACHE = "emojisurvivors-v19";
const isOurs = (k) =>
  k.startsWith("emojisurvivors-") && !k.startsWith("emojisurvivors3d-");
const SHELL_FIRST_PARTY = [
  "./",
  "./Index.html",
  "./Manifest.webmanifest",
  // Entry point
  "./Source/Main.js",
  // Engine
  "./Source/Engine/GameLoop.js",
  "./Source/Engine/Rng.js",
  "./Source/Engine/State.js",
  "./Source/Engine/StateMachine.js",
  // World
  "./Source/World/SpatialHash.js",
  "./Source/World/Camera.js",
  "./Source/World/Pool.js",
  // Systems
  "./Source/Systems/Movement.js",
  "./Source/Systems/Spawner.js",
  "./Source/Systems/WeaponSystem.js",
  "./Source/Systems/CombatSystem.js",
  "./Source/Systems/PickupSystem.js",
  "./Source/Systems/Leveling.js",
  "./Source/Systems/StatsModel.js",
  "./Source/Systems/Evolutions.js",
  // Content
  "./Source/Content/Characters.js",
  "./Source/Content/Weapons.js",
  "./Source/Content/Passives.js",
  "./Source/Content/Enemies.js",
  "./Source/Content/Bosses.js",
  "./Source/Content/PowerGrid.js",
  "./Source/Content/Curve.js",
  "./Source/Content/Modifiers.js",
  // Render
  "./Source/Render/Renderer.js",
  "./Source/Render/Particles.js",
  "./Source/Render/Fx.js",
  // Input
  "./Source/Input/Input.js",
  // Audio
  "./Source/Audio/Sfx.js",
  // Net (co-op)
  "./Source/Net/Signal.js",
  "./Source/Net/Rtc.js",
  "./Source/Net/Protocol.js",
  "./Source/Net/Coop.js",
  // Meta
  "./Source/Meta/Save.js",
  "./Source/Meta/Meta.js",
  "./Source/Meta/Records.js",
  "./Source/Meta/OnlineBoard.js",
  // UI
  "./Source/UI/Dom.js",
  "./Source/UI/Icons.js",
  "./Source/UI/Shell.js",
  "./Source/UI/Hud.js",
  "./Source/UI/MenuScreen.js",
  "./Source/UI/SelectScreen.js",
  "./Source/UI/ConfigScreen.js",
  "./Source/UI/LevelUpScreen.js",
  "./Source/UI/PauseScreen.js",
  "./Source/UI/ResultScreen.js",
  "./Source/UI/ShopScreen.js",
  "./Source/UI/SettingsScreen.js",
  "./Source/UI/RecordsScreen.js",
  "./Source/UI/CoopScreen.js",
  // Styles
  "./Source/Styles/Theme.css",
  "./Source/Styles/Reset.css",
  "./Source/Styles/WaTheme.css",
  "./Source/Styles/Canvas.css",
  "./Source/Styles/Layout.css",
  "./Source/Styles/Hud.css",
  // Assets
  "./Source/Assets/Icon.svg",
  "./Source/Assets/Icon192.png",
  "./Source/Assets/Icon512.png",
];
const SHELL_VENDOR = [
  "./Source/Vendor/WebAwesome/webawesome.loader.js",
  "./Source/Vendor/WebAwesome/styles/webawesome.css",
  "./Source/Vendor/WebAwesome/styles/layers.css",
  "./Source/Vendor/WebAwesome/styles/native.css",
  "./Source/Vendor/WebAwesome/styles/utilities.css",
  "./Source/Vendor/WebAwesome/styles/themes/default.css",
  "./Source/Vendor/WebAwesome/styles/color/palettes/default.css",
  "./Source/Vendor/WebAwesome/styles/color/palettes/base.css",
  "./Source/Vendor/FontAwesome/css/fontawesome.css",
  "./Source/Vendor/FontAwesome/css/duotone.css",
  "./Source/Vendor/FontAwesome/webfonts/fa-duotone-900.woff2",
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
            .filter((k) => isOurs(k) && k !== CACHE)
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
