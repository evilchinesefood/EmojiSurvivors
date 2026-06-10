// Co-op wire format: pack a live host sim, sync the string tables the way the
// ctrl channel would, and verify the guest-side unpack round-trips.
import { describe, it, expect } from "./Runner.js";
import {
  makeTables,
  tableAdd,
  packSnapshot,
  unpackSnapshot,
} from "../Shared/Net/Protocol.js";
import { createRunState, addAlly } from "../Shared/Engine/State.js";
import { spawnEnemy, spawnBoss } from "../Shared/Systems/Spawner.js";
import { difficulty } from "../Shared/Content/Curve.js";
import { ENEMIES } from "../Shared/Content/Enemies.js";
import { CHARACTERS, STARTER_ID } from "../Shared/Content/Characters.js";

describe("Co-op protocol", () => {
  it("snapshot round-trips entities, players, and string tables", () => {
    const s = createRunState({
      seed: 3,
      runLength: 300,
      character: CHARACTERS[STARTER_ID],
    });
    s.player.x = 12345.5;
    s.player.y = -777;
    s.player.kills = 4242;
    const al = addAlly(s, {
      id: "g1",
      name: "G",
      character: CHARACTERS.mage,
    });
    al.x = 12400;
    al.coins = 9;
    const e = spawnEnemy(
      s,
      ENEMIES.zombie,
      s.player.x + 200,
      s.player.y - 50,
      difficulty(0),
    );
    s.hazards.push({
      x: s.player.x + 10,
      y: s.player.y + 10,
      r: 80,
      color: "rgba(236,233,224,",
      life: 0.07,
      maxLife: 0.14,
    });
    s.auraViz.push({ r: 120, color: "rgba(116,224,74," });

    const host = makeTables();
    const guest = makeTables();
    const players = [
      { slot: 0, emoji: s.character.emoji, unit: s.player, downed: false },
      { slot: 1, emoji: al.emoji, unit: al, downed: al.downed },
    ];
    const buf = packSnapshot(s, host, players);
    for (const m of host.dirty.splice(0)) tableAdd(guest, m); // "ctrl channel"
    const g = unpackSnapshot(buf, guest);

    expect(g.kills).toBe(4242);
    expect(g.players.length).toBe(2);
    expect(g.players[1].coins).toBe(9);
    expect(Math.abs(g.players[1].x - 12400) < 1).toBeTruthy();
    expect(g.enemies.length).toBe(1);
    expect(g.enemies[0].emoji).toBe(e.emoji);
    expect(Math.abs(g.enemies[0].x - e.x) <= 1).toBeTruthy();
    expect(g.enemies[0].boss).toBe(false);
    expect(g.hazards[0].color).toBe("rgba(236,233,224,");
    expect(Math.abs(g.hazards[0].life - 0.5) < 0.01).toBeTruthy();
    expect(g.auras[0].r).toBe(120);
  });

  it("boss flag + hp ride the snapshot; unknown table idx degrades safely", () => {
    const s = createRunState({
      seed: 5,
      runLength: 300,
      character: CHARACTERS[STARTER_ID],
    });
    spawnBoss(s);
    const host = makeTables();
    const buf = packSnapshot(s, host, [
      { slot: 0, emoji: "🛡️", unit: s.player, downed: false },
    ]);
    const guest = makeTables(); // tables NOT synced — simulates the channel race
    const g = unpackSnapshot(buf, guest);
    expect(g.enemies[0].boss).toBe(true);
    expect(g.bossHp > 0).toBeTruthy();
    expect(g.enemies[0].emoji).toBe("❔"); // placeholder, never a crash
  });
});
