// Co-op wire format. Host packs the sim into a compact binary snapshot (~4-8KB
// at full swarm, sent ~20Hz over an unreliable channel); guests unpack into a
// renderer-shaped "ghost". Emoji + hazard-color strings travel once each over
// the reliable channel as string-table entries (idx -> value), so entity records
// stay 1 byte each. Entity positions are int16-relative to the host (the view
// radius is ~1000); player positions are absolute f32.
const CAP = {
  enemies: 450,
  projs: 200,
  picks: 250,
  orbits: 24,
  hazards: 24,
  auras: 4,
};
const BUF = new ArrayBuffer(16384);

export function makeTables() {
  return {
    e: { map: new Map(), list: [] },
    c: { map: new Map(), list: [] },
    dirty: [], // queued {t:"tab",k,i,v} ctrl messages (host side)
  };
}

function tIdx(tables, k, str) {
  const tab = tables[k];
  let i = tab.map.get(str);
  if (i === undefined) {
    i = tab.list.length;
    if (i > 250) return 0; // table full — render as slot 0 rather than corrupt
    tab.map.set(str, i);
    tab.list.push(str);
    tables.dirty.push({ t: "tab", k, i, v: str });
  }
  return i;
}

export function tableAdd(tables, m) {
  const tab = tables[m.k];
  if (tab && m.i >= 0 && m.i < 256) tab.list[m.i] = String(m.v);
}

const clampRel = (v) => Math.max(-32700, Math.min(32700, Math.round(v)));

// playersMeta: [{slot, emoji, unit, downed}] — slot 0 is the host player.
export function packSnapshot(state, tables, playersMeta) {
  const dv = new DataView(BUF);
  const hx = state.player.x;
  const hy = state.player.y;
  let boss = null;
  for (const e of state.enemies)
    if (e.boss) {
      boss = e;
      break;
    }
  dv.setUint8(0, 1);
  dv.setFloat32(1, state.time, true);
  dv.setFloat32(5, hx, true);
  dv.setFloat32(9, hy, true);
  dv.setUint8(13, Math.min(255, state.player.level));
  dv.setFloat32(14, state.player.xp, true);
  dv.setFloat32(18, state.player.xpNext, true);
  dv.setUint32(22, state.player.kills, true);
  dv.setFloat32(26, boss ? boss.hp : 0, true);
  dv.setFloat32(30, boss ? boss.maxHp : 0, true);
  dv.setUint8(34, playersMeta.length);
  let o = 35;
  for (const pm of playersMeta) {
    const u = pm.unit;
    dv.setUint8(o, pm.slot);
    dv.setUint8(o + 1, tIdx(tables, "e", pm.emoji));
    dv.setUint8(o + 2, pm.downed ? 1 : 0);
    dv.setUint8(o + 3, 0);
    dv.setFloat32(o + 4, u.x, true);
    dv.setFloat32(o + 8, u.y, true);
    dv.setUint16(o + 12, Math.max(0, Math.min(65535, Math.round(u.hp))), true);
    dv.setUint16(o + 14, Math.min(65535, Math.round(u.maxHp)), true);
    dv.setUint16(o + 16, Math.min(65535, u.coins || 0), true);
    o += 18;
  }

  const en = state.enemies;
  const nE = Math.min(en.length, CAP.enemies);
  dv.setUint16(o, nE, true);
  o += 2;
  for (let i = 0; i < nE; i++) {
    const e = en[i];
    dv.setUint16(o, e.uid & 0xffff, true);
    dv.setInt16(o + 2, clampRel(e.x - hx), true);
    dv.setInt16(o + 4, clampRel(e.y - hy), true);
    dv.setUint8(o + 6, tIdx(tables, "e", e.emoji));
    dv.setUint8(o + 7, Math.min(127, Math.round(e.size)) | (e.boss ? 0x80 : 0));
    o += 8;
  }

  const six = (list, n, emojiOf, sizeOf) => {
    for (let i = 0; i < n; i++) {
      const it = list[i];
      dv.setInt16(o, clampRel(it.x - hx), true);
      dv.setInt16(o + 2, clampRel(it.y - hy), true);
      dv.setUint8(o + 4, tIdx(tables, "e", emojiOf(it)));
      dv.setUint8(o + 5, Math.min(255, Math.round(sizeOf(it))));
      o += 6;
    }
  };
  const nP = Math.min(state.projectiles.length, CAP.projs);
  dv.setUint8(o, nP);
  o += 1;
  six(
    state.projectiles,
    nP,
    (p) => p.emoji,
    (p) => p.size || 20,
  );

  const picks = [];
  for (const g of state.gems) picks.push(g);
  for (const c of state.coins) picks.push(c);
  for (const d of state.drops) picks.push(d);
  const nK = Math.min(picks.length, CAP.picks);
  dv.setUint16(o, nK, true);
  o += 2;
  six(
    picks,
    nK,
    (p) => p.emoji,
    (p) => p.size || 14,
  );

  const nO = Math.min(state.orbits.length, CAP.orbits);
  dv.setUint8(o, nO);
  o += 1;
  six(
    state.orbits,
    nO,
    (p) => p.emoji,
    (p) => p.size || 22,
  );

  const nH = Math.min(state.hazards.length, CAP.hazards);
  dv.setUint8(o, nH);
  o += 1;
  for (let i = 0; i < nH; i++) {
    const z = state.hazards[i];
    dv.setInt16(o, clampRel(z.x - hx), true);
    dv.setInt16(o + 2, clampRel(z.y - hy), true);
    dv.setUint16(o + 4, Math.min(65535, Math.round(z.r)), true);
    dv.setUint8(o + 6, tIdx(tables, "c", z.color || "rgba(155,108,255,"));
    dv.setUint8(
      o + 7,
      Math.round(255 * Math.max(0, z.life / (z.maxLife || 1))),
    );
    o += 8;
  }

  const nA = Math.min(state.auraViz.length, CAP.auras);
  dv.setUint8(o, nA);
  o += 1;
  for (let i = 0; i < nA; i++) {
    const av = state.auraViz[i];
    dv.setUint16(o, Math.min(65535, Math.round(av.r)), true);
    dv.setUint8(o + 2, tIdx(tables, "c", av.color));
    o += 3;
  }

  return BUF.slice(0, o);
}

export function unpackSnapshot(buf, tables) {
  try {
    const dv = new DataView(buf);
    if (dv.getUint8(0) !== 1) return null;
    const eT = (i) => tables.e.list[i] ?? "❔";
    const cT = (i) => tables.c.list[i] ?? "rgba(155,108,255,";
    const s = {
      time: dv.getFloat32(1, true),
      hostX: dv.getFloat32(5, true),
      hostY: dv.getFloat32(9, true),
      level: dv.getUint8(13),
      xp: dv.getFloat32(14, true),
      xpNext: dv.getFloat32(18, true),
      kills: dv.getUint32(22, true),
      bossHp: dv.getFloat32(26, true),
      bossMax: dv.getFloat32(30, true),
      players: [],
      enemies: [],
      projectiles: [],
      pickups: [],
      orbits: [],
      hazards: [],
      auras: [],
    };
    const pc = dv.getUint8(34);
    let o = 35;
    for (let i = 0; i < pc; i++) {
      s.players.push({
        slot: dv.getUint8(o),
        emoji: eT(dv.getUint8(o + 1)),
        downed: !!(dv.getUint8(o + 2) & 1),
        x: dv.getFloat32(o + 4, true),
        y: dv.getFloat32(o + 8, true),
        hp: dv.getUint16(o + 12, true),
        maxHp: dv.getUint16(o + 14, true),
        coins: dv.getUint16(o + 16, true),
      });
      o += 18;
    }
    const hx = s.hostX;
    const hy = s.hostY;
    const nE = dv.getUint16(o, true);
    o += 2;
    for (let i = 0; i < nE; i++) {
      const sb = dv.getUint8(o + 7);
      s.enemies.push({
        uid: dv.getUint16(o, true),
        x: hx + dv.getInt16(o + 2, true),
        y: hy + dv.getInt16(o + 4, true),
        emoji: eT(dv.getUint8(o + 6)),
        size: sb & 0x7f,
        boss: !!(sb & 0x80),
      });
      o += 8;
    }
    const six = (out, n) => {
      for (let i = 0; i < n; i++) {
        out.push({
          x: hx + dv.getInt16(o, true),
          y: hy + dv.getInt16(o + 2, true),
          emoji: eT(dv.getUint8(o + 4)),
          size: dv.getUint8(o + 5),
        });
        o += 6;
      }
    };
    const nP = dv.getUint8(o);
    o += 1;
    six(s.projectiles, nP);
    const nK = dv.getUint16(o, true);
    o += 2;
    six(s.pickups, nK);
    const nO = dv.getUint8(o);
    o += 1;
    six(s.orbits, nO);
    const nH = dv.getUint8(o);
    o += 1;
    for (let i = 0; i < nH; i++) {
      s.hazards.push({
        x: hx + dv.getInt16(o, true),
        y: hy + dv.getInt16(o + 2, true),
        r: dv.getUint16(o + 4, true),
        color: cT(dv.getUint8(o + 6)),
        life: dv.getUint8(o + 7) / 255,
        maxLife: 1,
      });
      o += 8;
    }
    const nA = dv.getUint8(o);
    o += 1;
    for (let i = 0; i < nA; i++) {
      s.auras.push({ r: dv.getUint16(o, true), color: cT(dv.getUint8(o + 2)) });
      o += 3;
    }
    return s;
  } catch {
    // A truncated or garbage snapshot (declared counts overrunning the buffer)
    // makes DataView throw — degrade to null instead of killing the snap handler.
    return null;
  }
}
