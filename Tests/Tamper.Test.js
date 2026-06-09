import { describe, it, expect } from "./Runner.js";
import { SAVE_KEY, SIG_KEY, signature } from "../Source/Meta/Save.js";
import { makeMeta } from "../Source/Meta/Meta.js";
import { CHARACTERS } from "../Source/Content/Characters.js";
import { createRunState } from "../Source/Engine/State.js";
import { damageMul } from "../Source/Systems/WeaponSystem.js";

function mem(seed) {
  const store = seed ? { ...seed } : {};
  return {
    store,
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      store[k] = String(v);
    },
  };
}

describe("Tamper — save signing", () => {
  it("persisting writes a matching sibling signature", () => {
    const st = mem();
    makeMeta(st).bankRun(300, 50, 10);
    expect(st.store[SIG_KEY]).toBe(signature(st.store[SAVE_KEY]));
  });

  it("a clean save round-trips untainted", () => {
    const st = mem();
    makeMeta(st).bankRun(300, 50, 10);
    expect(makeMeta(st).tainted).toBe(false);
  });

  it("an edited save loads tainted, and the taint sticks", () => {
    const st = mem();
    makeMeta(st).bankRun(300, 50, 10);
    const raw = JSON.parse(st.store[SAVE_KEY]);
    raw.coins = 999999;
    st.store[SAVE_KEY] = JSON.stringify(raw);
    const meta = makeMeta(st);
    expect(meta.tainted).toBe(true);
    meta.bankRun(300, 1, 1); // re-persist re-signs WITH the taint flag
    expect(makeMeta(st).tainted).toBe(true);
  });

  it("a wrong signature on a v3 save is tainted", () => {
    const st = mem();
    makeMeta(st).bankRun(300, 10, 10);
    st.store[SIG_KEY] = "deadbeef";
    expect(makeMeta(st).tainted).toBe(true);
  });

  it("pre-signing (v2) saves get amnesty", () => {
    const st = mem({
      [SAVE_KEY]: JSON.stringify({ version: 2, coins: 777 }),
    });
    const meta = makeMeta(st);
    expect(meta.tainted).toBe(false);
    expect(meta.coins).toBe(777);
  });

  it("tainted prices are 10x (grid + characters)", () => {
    const st = mem();
    makeMeta(st).bankRun(300, 50, 10);
    const raw = JSON.parse(st.store[SAVE_KEY]);
    raw.coins = 12;
    st.store[SAVE_KEY] = JSON.stringify(raw);
    const meta = makeMeta(st);
    expect(meta.gridCost("might")).toBe(500);
    expect(meta.charCost(CHARACTERS.witch)).toBe(5000);
  });

  it("tainted runs: half damage, clown auditor, potato boss", () => {
    const s = createRunState({
      seed: 5,
      runLength: 300,
      character: CHARACTERS.knight,
      tainted: true,
    });
    expect(damageMul(s)).toBe(0.5);
    expect(s.auditor !== null).toBe(true);
    const clean = createRunState({
      seed: 5,
      runLength: 300,
      character: CHARACTERS.knight,
    });
    expect(damageMul(clean)).toBe(1);
    expect(clean.auditor).toBe(null);
  });
});

describe("Tamper — character unlocks", () => {
  it("free characters are always unlocked; costed ones are not", () => {
    const meta = makeMeta(mem());
    expect(meta.isCharUnlocked(CHARACTERS.knight)).toBe(true);
    expect(meta.isCharUnlocked(CHARACTERS.necromancer)).toBe(true);
    expect(meta.isCharUnlocked(CHARACTERS.witch)).toBe(false);
    expect(meta.isCharUnlocked(CHARACTERS.reaper)).toBe(false);
  });

  it("buyCharacter spends coins, persists, and refuses the unaffordable", () => {
    const st = mem();
    let meta = makeMeta(st);
    meta.bankRun(300, 600, 1);
    expect(meta.buyCharacter(CHARACTERS.reaper)).toBe(false); // costs 1200
    expect(meta.buyCharacter(CHARACTERS.witch)).toBe(true); // costs 500
    expect(meta.coins).toBe(100);
    expect(meta.buyCharacter(CHARACTERS.witch)).toBe(false); // already owned
    meta = makeMeta(st);
    expect(meta.isCharUnlocked(CHARACTERS.witch)).toBe(true);
  });
});
