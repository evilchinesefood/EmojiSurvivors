import { describe, it, expect } from "./Runner.js";
import {
  boardKey,
  compareEntries,
  insertEntry,
  topFor,
  BOARD_CAP,
} from "../Shared/Meta/Records.js";
import { migrate } from "../Shared/Meta/Save.js";
import { makeMeta } from "../Shared/Meta/Meta.js";

const E = (over = {}) => ({
  date: 1000,
  runLength: 300,
  endless: false,
  hard: false,
  won: false,
  score: 0,
  time: 100,
  kills: 50,
  level: 5,
  character: "knight",
  mods: [],
  ...over,
});

function mem() {
  const store = {};
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      store[k] = String(v);
    },
  };
}

describe("Records — boards", () => {
  it("boardKey splits by length, mode, and difficulty", () => {
    expect(boardKey(E())).toBe("300:standard:normal");
    expect(boardKey(E({ runLength: 900, endless: true, hard: true }))).toBe(
      "900:endless:hard",
    );
  });

  it("standard ranking: victory first, then kills, then time", () => {
    const win = E({ won: true, kills: 10, time: 312 });
    const loss = E({ kills: 900, time: 290 });
    expect(compareEntries(win, loss) < 0).toBe(true);
    const moreKills = E({ won: true, kills: 20, time: 350 });
    expect(compareEntries(moreKills, win) < 0).toBe(true);
    const fasterWin = E({ won: true, kills: 10, time: 305 });
    expect(compareEntries(fasterWin, win) < 0).toBe(true);
    const longerLoss = E({ kills: 50, time: 200 });
    expect(compareEntries(longerLoss, E({ kills: 50, time: 100 })) < 0).toBe(
      true,
    );
  });

  it("endless ranks by score", () => {
    const a = E({ endless: true, score: 900 });
    const b = E({ endless: true, score: 1200 });
    expect(compareEntries(b, a) < 0).toBe(true);
  });

  it("insertEntry prunes each board to the cap and reports placement", () => {
    const recs = [];
    for (let i = 0; i < 15; i++)
      insertEntry(recs, E({ kills: i * 10, time: 100 + i }));
    expect(recs.length).toBe(BOARD_CAP);
    const top = topFor(recs, "300:standard:normal");
    expect(top[0].kills).toBe(140);
    expect(insertEntry(recs, E({ kills: 1, time: 1 }))).toBe(false);
    expect(insertEntry(recs, E({ won: true, kills: 1, time: 312 }))).toBe(true);
  });

  it("boards are independent — a hard entry never lands on the normal board", () => {
    const recs = [];
    insertEntry(recs, E({ hard: true, kills: 999 }));
    expect(topFor(recs, "300:standard:normal").length).toBe(0);
    expect(topFor(recs, "300:standard:hard").length).toBe(1);
  });

  it("meta.recordEntry persists and prunes", () => {
    const st = mem();
    const meta = makeMeta(st);
    for (let i = 0; i < 13; i++)
      meta.recordEntry(E({ kills: i, time: 50 + i }));
    expect(makeMeta(st).records.length).toBe(BOARD_CAP);
  });

  it("migrate keeps well-formed records and drops garbage", () => {
    const m = migrate({
      version: 3,
      records: [E(), "junk", null, { kills: "9", time: 5, character: 7 }],
    });
    expect(m.records.length).toBe(2);
    expect(m.records[0].kills).toBe(50);
    expect(m.records[1].kills).toBe(9); // coerced
    expect(m.records[1].character).toBe(""); // non-string dropped
  });

  it("migrate caps playerName and keeps unlockedChars valid", () => {
    const m = migrate({
      version: 3,
      playerName: "x".repeat(99),
      unlockedChars: ["witch", "knight", "nope", "witch"],
    });
    expect(m.playerName.length).toBe(24);
    expect(m.unlockedChars).toEqual(["witch"]); // free + unknown + dupes dropped
  });
});
