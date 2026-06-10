// Three.js first-person draw layer. Reads sim state + the FPS camera and renders
// the plane-based sim as a moonlit 3D graveyard: real lighting + cascading prop
// shadows, instanced 3D props (tombstones / trees / lanterns / rocks / grass), a
// star-dome sky, and every emoji entity drawn in ONE instanced, atlas-backed
// billboard draw call (the perf core — per-entity THREE.Sprites were ~1 draw call
// each). Purely a view of frozen state — it never mutates the sim.
import * as THREE from "../Vendor/Three/three.module.js";

const EMOJI_FONT =
  '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
const BG = 0x0e0b14;
const FOG_DENSITY = 0.0021; // swarm spawns (~660-740) materialize inside the murk
const VIEW_R = 980; // hard entity cull just past the fog wall
const GROUND_TILE = 280;

// Adaptive quality: step down (never up) when the frame EMA stays slow, so weaker
// GPUs hold 60 fps. Coarse-pointer devices start one tier down.
const QUALITY = [
  { dpr: 2, shadow: 2048, mist: true },
  { dpr: 1.5, shadow: 1024, mist: true },
  { dpr: 1.1, shadow: 1024, mist: false },
];

function canvasTex(draw, w = 128, h = w) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Tiny deterministic LCG for procedural textures (stable across loads).
function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0), s / 4294967296);
}

function hash32(x, y) {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

// ── Terrain: gentle rolling hills (max slope ~13°, so walking stays plausible
// without sim slope physics) with winding stream channels carved along z,
// repeating every 1400 units in x. Pure function of world position — the sim
// stays planar; the view (and everything standing in it) follows this surface.
const WATER_Y = -10; // ~14% of the world wet: winding streams + occasional ponds
export function terrainH(x, z) {
  let h =
    12 * Math.sin(x * 0.0042 + 1.7) * Math.cos(z * 0.0036 - 0.6) +
    7 * Math.sin(x * 0.0093 - 2.1) * Math.cos(z * 0.0081 + 1.3) +
    3 * Math.sin(x * 0.021 + 0.4) * Math.cos(z * 0.018 + 2.2);
  const xc = 230 * Math.sin(z * 0.0019) + 90 * Math.sin(z * 0.0057);
  let d = (((x - xc) % 1400) + 1400) % 1400;
  d = Math.min(d, 1400 - d); // distance to the nearest channel centerline
  const t = Math.max(0, 1 - d / 110);
  h -= 16 * t * t * (3 - 2 * t); // smoothstep-carved stream bed
  return h;
}

// "rgba(r,g,b," prefix strings (sim hazard/aura colors) → THREE color components.
const rgbCache = new Map();
function rgbOf(prefix) {
  let v = rgbCache.get(prefix);
  if (!v) {
    const m = prefix.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    v = m
      ? { r: +m[1] / 255, g: +m[2] / 255, b: +m[3] / 255 }
      : { r: 0.6, g: 0.42, b: 1 };
    rgbCache.set(prefix, v);
  }
  return v;
}

// Concatenate same-attribute indexed geometries (pre-transformed) into one.
function mergeGeoms(parts) {
  const pos = [];
  const norm = [];
  const uv = [];
  const idx = [];
  let off = 0;
  for (const g of parts) {
    const p = g.attributes.position;
    const n = g.attributes.normal;
    const u = g.attributes.uv;
    const ix = g.index;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      norm.push(n.getX(i), n.getY(i), n.getZ(i));
      uv.push(u ? u.getX(i) : 0, u ? u.getY(i) : 0);
    }
    for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + off);
    off += p.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(norm, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function placed(geo, x, y, z, rx = 0, ry = 0, rz = 0, s = 1) {
  const g = geo.clone();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz));
  m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s, s));
  g.applyMatrix4(m);
  return g;
}

export function makeRenderer3D(canvas) {
  const gl = new THREE.WebGLRenderer({ canvas, antialias: true });
  gl.setClearColor(BG);
  gl.shadowMap.enabled = true;
  gl.shadowMap.type = THREE.PCFSoftShadowMap;
  gl.toneMapping = THREE.ACESFilmicToneMapping;
  gl.toneMappingExposure = 1.56; // +25% over the original night pass — visibility

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(BG, FOG_DENSITY);
  const cam3 = new THREE.PerspectiveCamera(75, 1, 1, 2600);
  cam3.rotation.order = "YXZ";

  // ── Lights: cool moonlight key (shadow caster) + purple night-sky fill.
  const hemi = new THREE.HemisphereLight(0x564283, 0x1a1530, 1.45);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xaab8ff, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(QUALITY[0].shadow, QUALITY[0].shadow);
  sun.shadow.camera.left = -560;
  sun.shadow.camera.right = 560;
  sun.shadow.camera.top = 560;
  sun.shadow.camera.bottom = -560;
  sun.shadow.camera.near = 50;
  sun.shadow.camera.far = 2600;
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0004;
  scene.add(sun, sun.target);

  // ── Sky dome: vertical night gradient + stars, fog-exempt, follows the player.
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(2000, 24, 12),
    new THREE.MeshBasicMaterial({
      map: canvasTex(
        (ctx, w, h) => {
          const g = ctx.createLinearGradient(0, 0, 0, h);
          g.addColorStop(0, "#05030c");
          g.addColorStop(0.42, "#0b0718");
          g.addColorStop(0.62, "#181030");
          g.addColorStop(1, "#100c1a");
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, w, h);
        },
        64,
        512,
      ),
      side: THREE.BackSide,
      fog: false,
      toneMapped: false,
      depthWrite: false,
    }),
  );
  scene.add(sky);

  // Shared soft round dot for every Points cloud — raw gl points are SQUARES.
  const dotTex = canvasTex((ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.5, "rgba(255,255,255,0.45)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  }, 64);

  // ── Stars: a Points field on the dome (child of sky so it follows the player).
  // sizeAttenuation off → crisp constant-size dots, never magnified squares.
  {
    const N = 700;
    const sPos = new Float32Array(N * 3);
    const sCol = new Float32Array(N * 3);
    const rnd = lcg(1337);
    for (let i = 0; i < N; i++) {
      const az = rnd() * Math.PI * 2;
      const el = Math.asin(0.04 + rnd() * 0.96); // bias above the horizon
      const R = 1940;
      sPos[i * 3] = Math.cos(az) * Math.cos(el) * R;
      sPos[i * 3 + 1] = Math.sin(el) * R;
      sPos[i * 3 + 2] = Math.sin(az) * Math.cos(el) * R;
      const b = 0.25 + rnd() * 0.75;
      sCol[i * 3] = b * (0.82 + rnd() * 0.18);
      sCol[i * 3 + 1] = b * (0.82 + rnd() * 0.18);
      sCol[i * 3 + 2] = b;
    }
    const sGeo = new THREE.BufferGeometry();
    sGeo.setAttribute("position", new THREE.BufferAttribute(sPos, 3));
    sGeo.setAttribute("color", new THREE.BufferAttribute(sCol, 3));
    const stars = new THREE.Points(
      sGeo,
      new THREE.PointsMaterial({
        size: 2.6,
        sizeAttenuation: false,
        map: dotTex,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
        toneMapped: false,
      }),
    );
    stars.frustumCulled = false;
    sky.add(stars);
  }

  // ── Moon: glow sprite aligned with the moonlight direction.
  const moon = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: canvasTex((ctx, s) => {
        const g = ctx.createRadialGradient(
          s / 2,
          s / 2,
          s * 0.08,
          s / 2,
          s / 2,
          s / 2,
        );
        g.addColorStop(0, "rgba(245,242,232,1)");
        g.addColorStop(0.22, "rgba(232,226,244,0.85)");
        g.addColorStop(0.4, "rgba(214,205,232,0.3)");
        g.addColorStop(1, "rgba(214,205,232,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, s, s);
      }),
      transparent: true,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    }),
  );
  moon.scale.set(460, 460, 1);
  scene.add(moon);

  // ── Ground: flat (the sim is planar) but richly textured — mossy, mottled
  // graveyard earth. The plane snaps to texture-tile multiples under the player so
  // the pattern stays world-anchored.
  const groundTex = canvasTex((ctx, s) => {
    ctx.fillStyle = "#1a1528";
    ctx.fillRect(0, 0, s, s);
    const rnd = lcg(4242);
    const blob = (color, n, rMin, rMax) => {
      ctx.fillStyle = color;
      for (let i = 0; i < n; i++) {
        const x = rnd() * s;
        const y = rnd() * s;
        const r = rMin + rnd() * (rMax - rMin);
        ctx.beginPath();
        ctx.ellipse(x, y, r, r * (0.5 + rnd() * 0.5), rnd() * 3, 0, 7);
        ctx.fill();
        // wrap-around copies keep the tile seamless
        ctx.beginPath();
        ctx.ellipse(x - s, y, r, r * 0.7, 0, 0, 7);
        ctx.ellipse(x, y - s, r, r * 0.7, 0, 0, 7);
        ctx.fill();
      }
    };
    blob("rgba(34,44,30,0.25)", 60, 14, 52); // moss
    blob("rgba(40,28,48,0.3)", 70, 10, 44); // bruised earth
    blob("rgba(18,14,26,0.45)", 50, 8, 30); // shadowed pits
    blob("rgba(120,112,138,0.05)", 90, 2, 7); // pale pebbles
    const rnd2 = lcg(777);
    ctx.strokeStyle = "rgba(10,8,16,0.5)";
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 26; i++) {
      // hairline cracks
      let x = rnd2() * s;
      let y = rnd2() * s;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 5; k++) {
        x += (rnd2() - 0.5) * 36;
        y += (rnd2() - 0.5) * 36;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }, 512);
  groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
  groundTex.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
  const GROUND_W = 2240;
  const GROUND_SNAP = 70;
  const groundGeo = new THREE.PlaneGeometry(GROUND_W, GROUND_W, 72, 72);
  groundGeo.rotateX(-Math.PI / 2);
  const ground = new THREE.Mesh(
    groundGeo,
    new THREE.MeshStandardMaterial({
      map: groundTex,
      roughness: 0.96,
      metalness: 0,
    }),
  );
  ground.receiveShadow = true;
  scene.add(ground);
  // Re-displace the snapped ground sheet when the player crosses a snap cell:
  // vertex heights + world-anchored UVs + recomputed normals. ~5.3k verts every
  // ~70 units of travel — never enough to hitch a frame.
  let groundAX = 1e9;
  let groundAZ = 1e9;
  function rebuildGround(px, py) {
    const ax = px - (px % GROUND_SNAP);
    const az = py - (py % GROUND_SNAP);
    if (ax === groundAX && az === groundAZ) return;
    groundAX = ax;
    groundAZ = az;
    ground.position.set(ax, 0, az);
    const pos = groundGeo.attributes.position;
    const uv = groundGeo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const wx = ax + pos.getX(i);
      const wz = az + pos.getZ(i);
      pos.setY(i, terrainH(wx, wz));
      uv.setXY(i, wx / GROUND_TILE, wz / GROUND_TILE);
    }
    pos.needsUpdate = true;
    uv.needsUpdate = true;
    groundGeo.computeVertexNormals();
  }

  // ── Water: one animated sheet at WATER_Y — every terrain dip below it reads
  // as a stream (the carved channels) or pond. Snapped to texture-tile multiples
  // so the surface pattern stays world-anchored; the UV offset is the current.
  const waterTex = canvasTex((ctx, s) => {
    ctx.fillStyle = "#27405f";
    ctx.fillRect(0, 0, s, s);
    const rnd = lcg(31337);
    ctx.lineCap = "round";
    for (let i = 0; i < 46; i++) {
      const y = rnd() * s;
      ctx.strokeStyle =
        rnd() < 0.5
          ? `rgba(170,200,255,${0.06 + rnd() * 0.1})`
          : `rgba(20,32,54,${0.1 + rnd() * 0.14})`;
      ctx.lineWidth = 1 + rnd() * 3;
      ctx.beginPath();
      ctx.moveTo(rnd() * s - 40, y);
      ctx.lineTo(rnd() * s + 40, y + (rnd() - 0.5) * 8);
      ctx.stroke();
    }
  }, 256);
  waterTex.wrapS = waterTex.wrapT = THREE.RepeatWrapping;
  waterTex.repeat.set(8, 8);
  const WATER_SNAP = GROUND_W / 8; // one water-texture tile in world units
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND_W, GROUND_W),
    new THREE.MeshStandardMaterial({
      map: waterTex,
      transparent: true,
      opacity: 0.82,
      roughness: 0.15,
      metalness: 0.45,
    }),
  );
  water.rotation.x = -Math.PI / 2;
  scene.add(water);

  // ════ Instanced 3D props — real meshes, deterministic per world cell, instance
  // matrices rebuilt only when the player crosses a cell boundary.
  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x8d86a4,
    roughness: 0.9,
    flatShading: true,
  });
  const darkStoneMat = new THREE.MeshStandardMaterial({
    color: 0x5d5674,
    roughness: 0.95,
    flatShading: true,
  });
  const barkMat = new THREE.MeshStandardMaterial({
    color: 0x2e2433,
    roughness: 1,
    flatShading: true,
  });
  const pumpkinMat = new THREE.MeshStandardMaterial({
    color: 0xc9651f,
    roughness: 0.7,
  });
  const ironMat = new THREE.MeshStandardMaterial({
    color: 0x232030,
    roughness: 0.6,
    metalness: 0.6,
  });
  const grassMat = new THREE.MeshStandardMaterial({
    color: 0x55683f,
    roughness: 1,
    side: THREE.DoubleSide,
    alphaTest: 0.5,
    map: canvasTex((ctx, s) => {
      ctx.strokeStyle = "#cfd8b8";
      ctx.lineCap = "round";
      const rnd = lcg(99);
      for (let i = 0; i < 14; i++) {
        const x = s * (0.12 + (i / 14) * 0.76);
        ctx.lineWidth = 5 + rnd() * 5;
        ctx.beginPath();
        ctx.moveTo(x, s);
        ctx.quadraticCurveTo(
          x + (rnd() - 0.5) * 30,
          s * 0.5,
          x + (rnd() - 0.5) * 56,
          s * (0.05 + rnd() * 0.3),
        );
        ctx.stroke();
      }
    }),
  });

  const tombGeo = mergeGeoms([
    placed(new THREE.BoxGeometry(14, 22, 4), 0, 11, 0),
    placed(
      new THREE.CylinderGeometry(7, 7, 4, 12),
      0,
      22,
      0,
      Math.PI / 2,
      0,
      0,
    ),
  ]);
  const crossGeo = mergeGeoms([
    placed(new THREE.BoxGeometry(3.5, 26, 3.5), 0, 13, 0),
    placed(new THREE.BoxGeometry(16, 3.5, 3.5), 0, 18, 0),
  ]);
  const treeGeo = mergeGeoms([
    placed(new THREE.CylinderGeometry(1.6, 4.8, 48, 7), 0, 24, 0),
    placed(new THREE.CylinderGeometry(0.9, 1.8, 20, 5), 6, 40, 0, 0, 0, -0.85),
    placed(new THREE.CylinderGeometry(0.7, 1.5, 16, 5), -5, 34, 2, 0.3, 0, 0.9),
    placed(
      new THREE.CylinderGeometry(0.5, 1.1, 12, 5),
      2,
      46,
      -3,
      -0.7,
      0,
      -0.3,
    ),
  ]);
  const rockGeo = placed(
    new THREE.IcosahedronGeometry(7, 0),
    0,
    4.2,
    0,
    0,
    0,
    0,
    1,
  );
  rockGeo.scale(1.3, 0.65, 1);
  const pumpkinGeo = mergeGeoms([
    (() => {
      const g = new THREE.SphereGeometry(6, 10, 8);
      g.scale(1, 0.72, 1);
      g.translate(0, 4.1, 0);
      return g;
    })(),
    placed(new THREE.CylinderGeometry(0.7, 1.1, 3.4, 6), 0, 9.4, 0, 0, 0, 0.25),
  ]);
  const lanternGeo = mergeGeoms([
    placed(new THREE.BoxGeometry(1.8, 32, 1.8), 0, 16, 0),
    placed(new THREE.BoxGeometry(9, 1.5, 1.5), 3.6, 30.5, 0),
    placed(new THREE.BoxGeometry(0.6, 3, 0.6), 7.4, 28.5, 0),
  ]);
  const cageGeo = placed(new THREE.BoxGeometry(4.6, 6, 4.6), 0, 0, 0);
  const tuftGeo = mergeGeoms([
    placed(new THREE.PlaneGeometry(11, 11), 0, 5.5, 0),
    placed(new THREE.PlaneGeometry(11, 11), 0, 5.5, 0, 0, Math.PI / 2, 0),
  ]);

  // ── Buildings: small intact crypts + roofless chapel ruins + broken columns.
  // Scenery only — the sim has no collision, so the ruins are mostly gaps and
  // low fragments (walking "through" reads as stepping over rubble, not walls).
  const cryptGeo = mergeGeoms([
    placed(new THREE.BoxGeometry(40, 24, 30), 0, 12, 0),
    // gabled roof: two slabs rising to a ridge at z=0
    placed(new THREE.BoxGeometry(46, 2.5, 19), 0, 29, -8.2, -0.58, 0, 0),
    placed(new THREE.BoxGeometry(46, 2.5, 19), 0, 29, 8.2, 0.58, 0, 0),
  ]);
  const cryptDoorGeo = placed(new THREE.BoxGeometry(11, 16, 1.6), 0, 8, 15.5);
  const ruinGeo = mergeGeoms([
    placed(new THREE.BoxGeometry(18, 19, 4), -13, 9.5, 16),
    placed(new THREE.BoxGeometry(18, 19, 4), 13, 9.5, 16),
    placed(new THREE.BoxGeometry(10, 3.5, 4), 0, 20.5, 16), // lintel over the doorway gap
    placed(new THREE.BoxGeometry(4, 13, 34), -22, 6.5, 0),
    placed(new THREE.BoxGeometry(4, 8, 34), 22, 4, 0),
    placed(new THREE.BoxGeometry(44, 9, 4), 0, 4.5, -16), // collapsed back wall
  ]);
  const columnGeo = mergeGeoms([
    placed(new THREE.CylinderGeometry(3.2, 3.9, 17, 8), 0, 8.5, 0),
    placed(new THREE.CylinderGeometry(3, 3.4, 9, 8), 0, 19.5, 0, 0.18, 0, 0.34),
    // a fallen drum beside it
    placed(
      new THREE.CylinderGeometry(3, 3.3, 14, 8),
      12,
      3.4,
      7,
      Math.PI / 2,
      0,
      0.3,
    ),
  ]);

  function makeInstanced(geo, mat, max, shadows = true) {
    const m = new THREE.InstancedMesh(geo, mat, max);
    m.castShadow = shadows;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    m.count = 0;
    scene.add(m);
    return m;
  }
  const tombs = makeInstanced(tombGeo, stoneMat, 90);
  const crosses = makeInstanced(crossGeo, darkStoneMat, 70);
  const trees = makeInstanced(treeGeo, barkMat, 50);
  const rocks = makeInstanced(rockGeo, darkStoneMat, 90);
  const pumpkins = makeInstanced(pumpkinGeo, pumpkinMat, 50);
  const LANTERN_MAX = 44;
  const lanternPosts = makeInstanced(lanternGeo, ironMat, LANTERN_MAX);
  const cages = makeInstanced(
    cageGeo,
    new THREE.MeshBasicMaterial({ color: 0xffb866 }),
    LANTERN_MAX,
    false,
  );
  const tufts = makeInstanced(tuftGeo, grassMat, 1300, false);
  const crypts = makeInstanced(cryptGeo, stoneMat, 12);
  const cryptDoors = makeInstanced(
    cryptDoorGeo,
    new THREE.MeshBasicMaterial({ color: 0x07050d }),
    12,
    false,
  );
  const ruins = makeInstanced(ruinGeo, darkStoneMat, 12);
  const columns = makeInstanced(columnGeo, stoneMat, 12);

  const M4 = new THREE.Matrix4();
  const Q = new THREE.Quaternion();
  const EU = new THREE.Euler();
  const V3 = new THREE.Vector3();
  const SC = new THREE.Vector3();
  function setInst(mesh, i, x, y, z, ry, s) {
    EU.set(0, ry, 0);
    Q.setFromEuler(EU);
    V3.set(x, y, z);
    SC.set(s, s, s);
    M4.compose(V3, Q, SC);
    mesh.setMatrixAt(i, M4);
  }

  // Lantern glow: one shared additive sprite pool + 2 real point lights assigned to
  // the nearest lit lanterns (physical falloff; everything else is faked emissive).
  const glowTex = canvasTex((ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, "rgba(255,190,110,0.9)");
    g.addColorStop(0.4, "rgba(255,160,80,0.25)");
    g.addColorStop(1, "rgba(255,160,80,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
  const glowSprites = [];
  for (let i = 0; i < 44; i++) {
    const sp = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        opacity: 0.8,
      }),
    );
    sp.visible = false;
    sp.scale.set(30, 30, 1);
    scene.add(sp);
    glowSprites.push(sp);
  }
  const lampLights = [
    new THREE.PointLight(0xffb45e, 1400, 300, 2),
    new THREE.PointLight(0xffb45e, 1400, 300, 2),
    new THREE.PointLight(0xffb45e, 1400, 300, 2),
  ];
  for (const l of lampLights) scene.add(l);
  let lanternSpots = []; // world positions of placed lantern cages

  // Rotate a local (lx, lz) offset by an instance's yaw.
  function rotOff(lx, lz, ry) {
    return {
      x: lx * Math.cos(ry) + lz * Math.sin(ry),
      z: -lx * Math.sin(ry) + lz * Math.cos(ry),
    };
  }

  const PROP_CELL = 170;
  const BUILD_CELL = 760;
  let propCellX = 1e9;
  let propCellY = 1e9;
  function rebuildProps(px, py) {
    const counts = {
      tombs: 0,
      crosses: 0,
      trees: 0,
      rocks: 0,
      pumpkins: 0,
      lanterns: 0,
      crypts: 0,
      ruins: 0,
      columns: 0,
    };
    lanternSpots = [];

    function addLantern(wx, wy, ry) {
      if (counts.lanterns >= LANTERN_MAX) return;
      const hL = terrainH(wx, wy) - 0.4;
      setInst(lanternPosts, counts.lanterns, wx, hL, wy, ry, 1);
      const o = rotOff(7.4, 0, ry); // cage hangs at the arm tip
      const gx = wx + o.x;
      const gz = wy + o.z;
      setInst(cages, counts.lanterns, gx, hL + 25.5, gz, ry, 1);
      lanternSpots.push({ x: gx, y: hL + 25.5, z: gz });
      counts.lanterns++;
    }

    const cx0 = Math.floor((px - VIEW_R) / PROP_CELL);
    const cx1 = Math.floor((px + VIEW_R) / PROP_CELL);
    const cy0 = Math.floor((py - VIEW_R) / PROP_CELL);
    const cy1 = Math.floor((py + VIEW_R) / PROP_CELL);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const hsh = hash32(cx, cy);
        if (hsh % 100 >= 52) continue;
        const wx = cx * PROP_CELL + (((hsh >>> 12) & 255) / 255) * PROP_CELL;
        const wy = cy * PROP_CELL + (((hsh >>> 20) & 255) / 255) * PROP_CELL;
        const hT = terrainH(wx, wy);
        const ry = (((hsh >>> 5) & 255) / 255) * Math.PI * 2;
        const s = 0.75 + ((hsh >>> 9) & 7) / 9;
        const kind = (hsh >>> 7) % 100;
        // Streams drown everything except rocks (boulders breaking the current).
        if (hT < WATER_Y + 2 && !(kind >= 57 && kind < 77)) continue;
        if (kind < 28 && counts.tombs < 90)
          setInst(tombs, counts.tombs++, wx, hT - 0.6, wy, ry, s);
        else if (kind < 42 && counts.crosses < 70)
          setInst(crosses, counts.crosses++, wx, hT - 0.6, wy, ry, s);
        else if (kind < 57 && counts.trees < 50)
          setInst(trees, counts.trees++, wx, hT - 0.6, wy, ry, s * 1.15);
        else if (kind < 77 && counts.rocks < 90)
          setInst(rocks, counts.rocks++, wx, hT - 0.6, wy, ry, s);
        else if (kind < 88 && counts.pumpkins < 50)
          setInst(pumpkins, counts.pumpkins++, wx, hT - 0.6, wy, ry, s);
        else addLantern(wx, wy, ry);
      }
    }

    // Buildings on their own sparser lattice, kept out of the water; each gets
    // door-flanking lanterns so settlements glow from a distance.
    const bx0 = Math.floor((px - VIEW_R) / BUILD_CELL);
    const bx1 = Math.floor((px + VIEW_R) / BUILD_CELL);
    const by0 = Math.floor((py - VIEW_R) / BUILD_CELL);
    const by1 = Math.floor((py + VIEW_R) / BUILD_CELL);
    for (let cx = bx0; cx <= bx1; cx++) {
      for (let cy = by0; cy <= by1; cy++) {
        const hsh = hash32(cx * 5 + 3, cy * 7 + 1);
        if (hsh % 100 >= 38) continue;
        const wx =
          cx * BUILD_CELL +
          (0.25 + (((hsh >>> 10) & 255) / 255) * 0.5) * BUILD_CELL;
        const wy =
          cy * BUILD_CELL +
          (0.25 + (((hsh >>> 18) & 255) / 255) * 0.5) * BUILD_CELL;
        const hB = terrainH(wx, wy);
        if (hB < WATER_Y + 3) continue;
        const ry =
          ((hsh >>> 3) & 3) * (Math.PI / 2) +
          (((hsh >>> 16) & 15) / 15 - 0.5) * 0.3;
        const kind = (hsh >>> 6) % 10;
        if (kind < 4 && counts.crypts < 12) {
          setInst(crypts, counts.crypts, wx, hB - 1.5, wy, ry, 1);
          setInst(cryptDoors, counts.crypts, wx, hB - 1.5, wy, ry, 1);
          counts.crypts++;
          for (const lx of [-14, 14]) {
            const o = rotOff(lx, 21, ry);
            addLantern(wx + o.x, wy + o.z, ry);
          }
        } else if (kind < 8 && counts.ruins < 12) {
          setInst(ruins, counts.ruins++, wx, hB - 1.5, wy, ry, 1);
          const o = rotOff(8, 22, ry);
          addLantern(wx + o.x, wy + o.z, ry);
        } else if (counts.columns < 12)
          setInst(columns, counts.columns++, wx, hB - 1, wy, ry, 1);
      }
    }

    tombs.count = counts.tombs;
    crosses.count = counts.crosses;
    trees.count = counts.trees;
    rocks.count = counts.rocks;
    pumpkins.count = counts.pumpkins;
    lanternPosts.count = counts.lanterns;
    cages.count = counts.lanterns;
    crypts.count = counts.crypts;
    cryptDoors.count = counts.crypts;
    ruins.count = counts.ruins;
    columns.count = counts.columns;
    for (const m of [
      tombs,
      crosses,
      trees,
      rocks,
      pumpkins,
      lanternPosts,
      cages,
      crypts,
      cryptDoors,
      ruins,
      columns,
    ])
      m.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < glowSprites.length; i++) {
      const sp = glowSprites[i];
      const spot = lanternSpots[i];
      sp.visible = !!spot;
      if (spot) sp.position.set(spot.x, spot.y, spot.z);
    }
  }

  const GRASS_CELL = 80;
  const GRASS_R = 620;
  let grassCellX = 1e9;
  let grassCellY = 1e9;
  function rebuildGrass(px, py) {
    let n = 0;
    const cx0 = Math.floor((px - GRASS_R) / GRASS_CELL);
    const cx1 = Math.floor((px + GRASS_R) / GRASS_CELL);
    const cy0 = Math.floor((py - GRASS_R) / GRASS_CELL);
    const cy1 = Math.floor((py + GRASS_R) / GRASS_CELL);
    for (let cx = cx0; cx <= cx1 && n < 1300; cx++) {
      for (let cy = cy0; cy <= cy1 && n < 1300; cy++) {
        const hsh = hash32(cx ^ 0x5bd1e995, cy ^ 0x119de1f3);
        const k = hsh % 4;
        for (let i = 0; i < k && n < 1300; i++) {
          const b = (hsh >>> (i * 7)) & 1023;
          const wx = cx * GRASS_CELL + ((b & 31) / 31) * GRASS_CELL;
          const wy = cy * GRASS_CELL + (((b >>> 5) & 31) / 31) * GRASS_CELL;
          const hT = terrainH(wx, wy);
          if (hT < WATER_Y + 1) continue; // no grass in the streams
          setInst(
            tufts,
            n++,
            wx,
            hT - 0.3,
            wy,
            (b % 7) * 0.9,
            0.7 + ((hsh >>> (i * 5 + 3)) & 7) / 8,
          );
        }
      }
    }
    tufts.count = n;
    tufts.instanceMatrix.needsUpdate = true;
  }

  // ════ Emoji billboards: ONE instanced draw call for every entity. A dynamic
  // 16×16 atlas (128px cells) collects each emoji on first use; per-instance
  // attributes carry position / size / atlas cell. Sorted far→near each frame
  // (single blended draw can't depth-sort itself).
  const ATLAS_N = 16;
  const ATLAS_CELL = 128;
  const atlasCanvas = document.createElement("canvas");
  atlasCanvas.width = atlasCanvas.height = ATLAS_N * ATLAS_CELL;
  const atlasCtx = atlasCanvas.getContext("2d");
  // No colorSpace tag: the billboard shader writes sampled colors raw (no output
  // transform), so an sRGB decode here would darken every emoji.
  const atlasTex = new THREE.CanvasTexture(atlasCanvas);
  const atlasSlots = new Map();
  function slotOf(emoji) {
    let s = atlasSlots.get(emoji);
    if (s === undefined) {
      s = atlasSlots.size;
      if (s >= ATLAS_N * ATLAS_N) return 0; // full — reuse slot 0 (never in practice)
      const cx = (s % ATLAS_N) * ATLAS_CELL;
      const cy = Math.floor(s / ATLAS_N) * ATLAS_CELL;
      atlasCtx.font = "92px " + EMOJI_FONT;
      atlasCtx.textAlign = "center";
      atlasCtx.textBaseline = "middle";
      atlasCtx.fillText(emoji, cx + ATLAS_CELL / 2, cy + ATLAS_CELL / 2 + 4);
      atlasSlots.set(emoji, s);
      atlasTex.needsUpdate = true;
    }
    return s;
  }

  const BB_MAX = 720;
  const quad = new THREE.PlaneGeometry(1, 1);
  const bbGeo = new THREE.InstancedBufferGeometry();
  bbGeo.index = quad.index;
  bbGeo.setAttribute("position", quad.attributes.position);
  bbGeo.setAttribute("uv", quad.attributes.uv);
  const aPos = new THREE.InstancedBufferAttribute(
    new Float32Array(BB_MAX * 3),
    3,
  );
  const aSize = new THREE.InstancedBufferAttribute(new Float32Array(BB_MAX), 1);
  const aCell = new THREE.InstancedBufferAttribute(
    new Float32Array(BB_MAX * 2),
    2,
  );
  aPos.setUsage(THREE.DynamicDrawUsage);
  aSize.setUsage(THREE.DynamicDrawUsage);
  aCell.setUsage(THREE.DynamicDrawUsage);
  bbGeo.setAttribute("aPos", aPos);
  bbGeo.setAttribute("aSize", aSize);
  bbGeo.setAttribute("aCell", aCell);
  const bbMat = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: atlasTex },
      uInset: { value: 4 / (ATLAS_N * ATLAS_CELL) },
      uCellUv: { value: 1 / ATLAS_N },
      fogColor: { value: new THREE.Color(BG) },
      fogDensity: { value: FOG_DENSITY },
    },
    vertexShader: `
      attribute vec3 aPos;
      attribute float aSize;
      attribute vec2 aCell;
      uniform float uCellUv;
      uniform float uInset;
      varying vec2 vUv;
      varying float vFogDepth;
      void main() {
        vec2 cellUv = uv * (uCellUv - 2.0 * uInset) + uInset;
        vUv = vec2(aCell.x * uCellUv, 1.0 - (aCell.y + 1.0) * uCellUv) + cellUv;
        vec4 mv = modelViewMatrix * vec4(aPos, 1.0);
        mv.xy += position.xy * aSize;
        vFogDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D map;
      uniform vec3 fogColor;
      uniform float fogDensity;
      varying vec2 vUv;
      varying float vFogDepth;
      void main() {
        vec4 c = texture2D(map, vUv);
        if (c.a < 0.03) discard;
        float f = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
        c.rgb = mix(c.rgb, fogColor, f);
        gl_FragColor = c;
      }`,
    transparent: true,
    depthWrite: false,
  });
  const bbMesh = new THREE.Mesh(bbGeo, bbMat);
  bbMesh.frustumCulled = false;
  bbMesh.renderOrder = 3;
  scene.add(bbMesh);

  // Pooled item records → sorted far-to-near → attribute fill. No per-frame allocs
  // beyond the sort's view slice.
  const bbItems = [];
  for (let i = 0; i < BB_MAX; i++)
    bbItems.push({ x: 0, z: 0, y: 0, size: 0, slot: 0, d: 0 });
  let bbUsed = 0;
  let bbPx = 0;
  let bbPy = 0;
  function pushBB(emoji, x, plane, size, lift) {
    if (bbUsed >= BB_MAX) return false;
    const dx = x - bbPx;
    const dz = plane - bbPy;
    const d2 = dx * dx + dz * dz;
    if (d2 > VIEW_R * VIEW_R) return false;
    const it = bbItems[bbUsed++];
    it.x = x;
    it.z = plane;
    it.y = lift + terrainH(x, plane); // entities stand on the hills
    it.size = size;
    it.slot = slotOf(emoji);
    it.d = d2;
    return true;
  }
  function flushBB() {
    const view = bbItems.slice(0, bbUsed);
    view.sort((a, b) => b.d - a.d);
    for (let i = 0; i < view.length; i++) {
      const it = view[i];
      aPos.array[i * 3] = it.x;
      aPos.array[i * 3 + 1] = it.y;
      aPos.array[i * 3 + 2] = it.z;
      aSize.array[i] = it.size;
      aCell.array[i * 2] = it.slot % ATLAS_N;
      aCell.array[i * 2 + 1] = Math.floor(it.slot / ATLAS_N);
    }
    bbGeo.instanceCount = bbUsed;
    aPos.needsUpdate = true;
    aSize.needsUpdate = true;
    aCell.needsUpdate = true;
    bbUsed = 0;
  }

  // ── Blob shadows: one instanced dark disc per entity (sprites can't cast real
  // shadows) — grounds everything against the lit floor.
  const blobTex = canvasTex((ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, "rgba(0,0,0,0.85)");
    g.addColorStop(0.7, "rgba(0,0,0,0.4)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
  const blobs = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: blobTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.55,
    }),
    BB_MAX,
  );
  blobs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  blobs.frustumCulled = false;
  blobs.renderOrder = 1;
  scene.add(blobs);
  let blobUsed = 0;
  const QFLAT = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(-Math.PI / 2, 0, 0),
  );
  function pushBlob(x, plane, r) {
    if (blobUsed >= BB_MAX) return;
    V3.set(x, terrainH(x, plane) + 0.6, plane);
    SC.set(r * 2, r * 2, 1);
    M4.compose(V3, QFLAT, SC);
    blobs.setMatrixAt(blobUsed++, M4);
  }
  function flushBlobs() {
    blobs.count = blobUsed;
    blobs.instanceMatrix.needsUpdate = true;
    blobUsed = 0;
  }

  // ── Floating text (damage numbers etc.) — few at once; plain sprites with a
  // bounded texture cache, wholesale reset on overflow (numbers churn).
  let textTexCache = new Map();
  function textTex(str, color) {
    const key = color + "|" + str;
    let e = textTexCache.get(key);
    if (!e) {
      if (textTexCache.size > 360) {
        for (const v of textTexCache.values()) v.tex.dispose();
        textTexCache = new Map();
      }
      const c = document.createElement("canvas");
      const ctx = c.getContext("2d");
      ctx.font = "700 56px " + EMOJI_FONT;
      const w = Math.ceil(ctx.measureText(str).width) + 16;
      c.width = Math.max(2, w);
      c.height = 72;
      ctx.font = "700 56px " + EMOJI_FONT;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 7;
      ctx.strokeStyle = "rgba(0,0,0,0.85)";
      ctx.strokeText(str, c.width / 2, 38);
      ctx.fillStyle = color;
      ctx.fillText(str, c.width / 2, 38);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      e = { tex, aspect: c.width / 72 };
      textTexCache.set(key, e);
    }
    return e;
  }
  const textSprites = [];
  let textUsed = 0;
  function takeText(tex) {
    let s;
    if (textUsed < textSprites.length) s = textSprites[textUsed];
    else {
      s = new THREE.Sprite(
        new THREE.SpriteMaterial({ transparent: true, depthWrite: false }),
      );
      s.renderOrder = 4;
      textSprites.push(s);
      scene.add(s);
    }
    textUsed++;
    s.visible = true;
    if (s.material.map !== tex) {
      s.material.map = tex;
      s.material.needsUpdate = true;
    }
    return s;
  }
  function finishText() {
    for (let i = textUsed; i < textSprites.length; i++)
      textSprites[i].visible = false;
    textUsed = 0;
  }

  // ── Ground-disc pool (auras + hazard blooms): flat additive circles.
  const discGeo = new THREE.CircleGeometry(1, 40);
  const discs = [];
  let discsUsed = 0;
  function takeDisc() {
    let m;
    if (discsUsed < discs.length) m = discs[discsUsed];
    else {
      m = new THREE.Mesh(
        discGeo,
        new THREE.MeshBasicMaterial({
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = 2;
      discs.push(m);
      scene.add(m);
    }
    discsUsed++;
    m.visible = true;
    return m;
  }
  function finishDiscs() {
    for (let i = discsUsed; i < discs.length; i++) discs[i].visible = false;
    discsUsed = 0;
  }

  // ── Dot-particle point cloud (one draw call; color fades with life).
  const PMAX = 700;
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(PMAX * 3);
  const pCol = new Float32Array(PMAX * 3);
  pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute("color", new THREE.BufferAttribute(pCol, 3));
  const points = new THREE.Points(
    pGeo,
    new THREE.PointsMaterial({
      size: 7,
      map: dotTex,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    }),
  );
  points.frustumCulled = false;
  scene.add(points);

  const pc = new THREE.Color();
  function drawParticles(particles) {
    let n = 0;
    if (particles) {
      const list = particles.list;
      for (let i = 0; i < list.length && n < PMAX; i++) {
        const p = list[i];
        const a = Math.max(0, p.life / p.maxLife);
        if (p.text) {
          const e = textTex(p.text, p.color);
          const s = takeText(e.tex);
          const h = Math.min(40, p.size * 1.7);
          s.scale.set(h * e.aspect, h, 1);
          s.position.set(p.x, p.z + terrainH(p.x, p.y), p.y);
          s.material.opacity = a;
        } else {
          if (p.color[0] === "#") pc.set(p.color);
          else {
            const c = rgbOf(p.color); // handles both rgba(...) and rgba( prefixes
            pc.setRGB(c.r, c.g, c.b);
          }
          pPos[n * 3] = p.x;
          pPos[n * 3 + 1] = p.z + terrainH(p.x, p.y);
          pPos[n * 3 + 2] = p.y;
          pCol[n * 3] = pc.r * a;
          pCol[n * 3 + 1] = pc.g * a;
          pCol[n * 3 + 2] = pc.b * a;
          n++;
        }
      }
    }
    pGeo.setDrawRange(0, n);
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.color.needsUpdate = true;
  }

  // ── Ambience: drifting ground mist + wandering fireflies.
  const mistTex = canvasTex((ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, "rgba(154,134,200,0.16)");
    g.addColorStop(0.6, "rgba(154,134,200,0.07)");
    g.addColorStop(1, "rgba(154,134,200,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
  const mists = [];
  for (let i = 0; i < 6; i++) {
    const sp = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: mistTex,
        transparent: true,
        depthWrite: false,
        opacity: 0.5,
      }),
    );
    sp.scale.set(520 + i * 70, 260 + i * 35, 1);
    scene.add(sp);
    mists.push(sp);
  }
  const FF_N = 90;
  const ffGeo = new THREE.BufferGeometry();
  const ffPos = new Float32Array(FF_N * 3);
  const ffCol = new Float32Array(FF_N * 3);
  ffGeo.setAttribute("position", new THREE.BufferAttribute(ffPos, 3));
  ffGeo.setAttribute("color", new THREE.BufferAttribute(ffCol, 3));
  const fireflies = new THREE.Points(
    ffGeo,
    new THREE.PointsMaterial({
      size: 2.8,
      map: dotTex,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  fireflies.frustumCulled = false;
  scene.add(fireflies);

  function ambience(px, py, t) {
    const hP = terrainH(px, py);
    for (let i = 0; i < mists.length; i++) {
      const a = i * 1.05 + t * (0.008 + i * 0.0013);
      const r = 240 + i * 60;
      mists[i].position.set(
        px + Math.cos(a) * r,
        hP + 24 + Math.sin(t * 0.1 + i) * 6,
        py + Math.sin(a) * r,
      );
      mists[i].material.opacity = 0.34 + 0.1 * Math.sin(t * 0.22 + i * 2.4);
    }
    for (let i = 0; i < FF_N; i++) {
      const sp = 0.07 + (i % 7) * 0.013;
      const r = 90 + ((i * 73) % 460);
      const a = i * 2.39996 + t * sp;
      const fx = px + Math.cos(a) * r;
      const fz = py + Math.sin(a * 0.83 + i) * r;
      ffPos[i * 3] = fx;
      ffPos[i * 3 + 1] =
        terrainH(fx, fz) + 12 + ((i * 31) % 46) + Math.sin(t * 0.7 + i) * 5;
      ffPos[i * 3 + 2] = fz;
      const tw = 0.25 + 0.75 * Math.max(0, Math.sin(t * 1.7 + i * 1.7));
      ffCol[i * 3] = 0.78 * tw;
      ffCol[i * 3 + 1] = 0.86 * tw;
      ffCol[i * 3 + 2] = 0.5 * tw;
    }
    ffGeo.attributes.position.needsUpdate = true;
    ffGeo.attributes.color.needsUpdate = true;
  }

  function inRange(cx, cy, x, y, extra = 0) {
    const dx = x - cx;
    const dy = y - cy;
    const r = VIEW_R + extra;
    return dx * dx + dy * dy < r * r;
  }

  function drawEntities(state, px, py) {
    const t = state.time;
    for (const g of state.gems) {
      const side = (g.size || 14) * 2.0;
      if (
        pushBB(
          g.emoji,
          g.x,
          g.y,
          side,
          16 + 3 * Math.sin(t * 3 + (g.x + g.y) * 0.02),
        )
      )
        pushBlob(g.x, g.y, side * 0.3);
    }
    for (const c of state.coins) {
      const side = (c.size || 16) * 2.0;
      if (
        pushBB(
          c.emoji,
          c.x,
          c.y,
          side,
          16 + 3 * Math.sin(t * 3 + (c.x + c.y) * 0.02),
        )
      )
        pushBlob(c.x, c.y, side * 0.3);
    }
    for (const d of state.drops) {
      const side = (d.size || 20) * 2.2;
      if (
        pushBB(
          d.emoji,
          d.x,
          d.y,
          side,
          20 + 4 * Math.sin(t * 2.4 + (d.x + d.y) * 0.02),
        )
      )
        pushBlob(d.x, d.y, side * 0.32);
    }
    for (const e of state.enemies) {
      const side = e.size * 2.6;
      // walkers hop; bosses glide (mass reads as menace)
      const hop = e.boss
        ? 0
        : Math.abs(Math.sin(t * 5 + (e.uid || 0) * 1.3)) * e.size * 0.16;
      if (pushBB(e.emoji, e.x, e.y, side, side * 0.4 + hop))
        pushBlob(e.x, e.y, e.size * 0.85);
    }
    for (const o of state.orbits) {
      pushBB(o.emoji, o.x, o.y, (o.size || 22) * 2.2, 42);
    }
    for (const p of state.projectiles) {
      if (pushBB(p.emoji, p.x, p.y, (p.size || 20) * 2.2, 38))
        pushBlob(p.x, p.y, (p.size || 20) * 0.45);
    }
    if (state.auditor && pushBB("🕵️", state.auditor.x, state.auditor.y, 66, 30))
      pushBlob(state.auditor.x, state.auditor.y, 18);
    if (state.cat && pushBB("🐈‍⬛", state.cat.x, state.cat.y, 50, 22))
      pushBlob(state.cat.x, state.cat.y, 14);
    // Co-op teammates (host's live allies, or a guest ghost's other players).
    if (state.allies) {
      for (const al of state.allies) {
        if (pushBB(al.downed ? "💀" : al.emoji || "🙂", al.x, al.y, 56, 34))
          pushBlob(al.x, al.y, 16);
      }
    }

    // Steady aura glows (continuous weapons) breathe around the player; hazards
    // are one-shot blooms with an ease-out fade.
    const breathe = 0.94 + 0.06 * Math.sin(t * 2);
    for (const av of state.auraViz) {
      const m = takeDisc();
      const col = rgbOf(av.color);
      m.material.color.setRGB(col.r, col.g, col.b);
      m.material.opacity = 0.3;
      const r = av.r * breathe;
      m.scale.set(r, r, 1);
      m.position.set(px, terrainH(px, py) + 1.8, py);
    }
    for (const z of state.hazards) {
      if (!inRange(px, py, z.x, z.y, z.r)) continue;
      const a = z.life != null ? Math.max(0, z.life / (z.maxLife || 1)) : 1;
      const m = takeDisc();
      const col = rgbOf(z.color || "rgba(155,108,255,");
      m.material.color.setRGB(col.r, col.g, col.b);
      m.material.opacity = 0.5 * a * a;
      m.scale.set(z.r, z.r, 1);
      m.position.set(z.x, terrainH(z.x, z.y) + 2.2, z.y);
    }
  }

  // ── Adaptive quality: EMA of real frame time; sustained slowness steps down.
  let qLevel =
    globalThis.matchMedia && matchMedia("(pointer: coarse)").matches ? 1 : 0;
  let lastW = 1;
  let lastH = 1;
  let baseDpr = 1;
  function applyQuality() {
    const q = QUALITY[qLevel];
    gl.setPixelRatio(Math.min(baseDpr, q.dpr));
    gl.setSize(lastW, lastH, false);
    if (sun.shadow.mapSize.x !== q.shadow) {
      sun.shadow.mapSize.set(q.shadow, q.shadow);
      if (sun.shadow.map) {
        sun.shadow.map.dispose();
        sun.shadow.map = null;
      }
    }
    for (const m of mists) m.visible = q.mist;
  }
  let emaMs = 16.7;
  let slowMs = 0;
  let lastFrameAt = 0;
  function tickQuality(now) {
    const dt = now - lastFrameAt;
    lastFrameAt = now;
    if (dt <= 0 || dt > 250) return;
    emaMs = emaMs * 0.94 + dt * 0.06;
    if (emaMs > 19.5) {
      slowMs += dt;
      if (slowMs > 2500 && qLevel < QUALITY.length - 1) {
        qLevel++;
        slowMs = 0;
        emaMs = 16.7;
        applyQuality();
      }
    } else slowMs = 0;
  }

  function frame(state, cam, particles, shake) {
    const now = performance.now();
    tickQuality(now);
    const t = now / 1000;
    const px = cam.x;
    const py = cam.y;

    rebuildGround(px, py);
    water.position.set(
      px - (px % WATER_SNAP),
      WATER_Y + 0.3 * Math.sin(t * 1.2),
      py - (py % WATER_SNAP),
    );
    waterTex.offset.y = (t * 0.02) % 1; // the current
    sky.position.set(px, 0, py);
    moon.position.set(px - 660, 600, py - 1400);
    // Snap the light to a coarse world grid so the shadow map doesn't shimmer.
    const sx = px - (px % 16);
    const sy = py - (py % 16);
    sun.position.set(sx - 700, 900, sy - 1500);
    sun.target.position.set(sx, 0, sy);

    const pcx = Math.floor(px / PROP_CELL);
    const pcy = Math.floor(py / PROP_CELL);
    if (pcx !== propCellX || pcy !== propCellY) {
      propCellX = pcx;
      propCellY = pcy;
      rebuildProps(px, py);
    }
    const gcx = Math.floor(px / GRASS_CELL);
    const gcy = Math.floor(py / GRASS_CELL);
    if (gcx !== grassCellX || gcy !== grassCellY) {
      grassCellX = gcx;
      grassCellY = gcy;
      rebuildGrass(px, py);
    }

    // Lantern flames: flicker the cages' glow + park the real lights on the
    // nearest lanterns (≤44 spots — a tiny sort per frame).
    const order = lanternSpots
      .map((L, i) => ({
        d: (L.x - px) * (L.x - px) + (L.z - py) * (L.z - py),
        i,
      }))
      .sort((a, b) => a.d - b.d);
    for (let k = 0; k < lampLights.length; k++) {
      const light = lampLights[k];
      if (k >= order.length) {
        light.intensity = 0;
        continue;
      }
      const idx = order[k].i;
      const L = lanternSpots[idx];
      light.position.set(L.x, L.y, L.z);
      light.intensity =
        1600 + 360 * Math.sin(t * 13 + idx * 5) + 170 * Math.sin(t * 31 + idx);
    }
    for (let i = 0; i < glowSprites.length && i < lanternSpots.length; i++)
      glowSprites[i].material.opacity = 0.62 + 0.18 * Math.sin(t * 11 + i * 3);

    ambience(px, py, t);

    bbPx = px;
    bbPy = py;
    if (state) drawEntities(state, px, py);
    drawParticles(particles);
    flushBB();
    flushBlobs();
    finishText();
    finishDiscs();

    // Walk bob from the player's actual velocity; shake jitters position + roll.
    let bob = 0;
    if (state) {
      const pl = state.player;
      const frac = Math.min(
        1,
        Math.hypot(pl.vx, pl.vy) / (state.stats.speed || 1),
      );
      bob = Math.sin(state.time * 10.5) * 2.3 * frac;
    }
    cam3.position.set(
      px + (shake ? shake.x : 0),
      terrainH(px, py) + cam.eye + bob,
      py + (shake ? shake.z : 0),
    );
    cam3.rotation.set(cam.pitch, cam.yaw, shake ? shake.roll : 0);
    gl.render(scene, cam3);
  }

  return {
    resize(w, h, dpr) {
      lastW = w;
      lastH = h;
      baseDpr = dpr;
      gl.setPixelRatio(Math.min(dpr, QUALITY[qLevel].dpr));
      gl.setSize(w, h, false);
      cam3.aspect = w / h;
      cam3.updateProjectionMatrix();
    },
    render(state, cam, particles, shake) {
      frame(state, cam, particles, shake);
    },
    background(cam) {
      frame(null, cam, null, null);
    },
  };
}
