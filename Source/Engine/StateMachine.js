export const S = {
  BOOT: "BOOT",
  MENU: "MENU",
  SELECT: "SELECT",
  CONFIG: "CONFIG",
  PLAYING: "PLAYING",
  PAUSED: "PAUSED",
  LEVELUP: "LEVELUP",
  GAMEOVER: "GAMEOVER",
  VICTORY: "VICTORY",
  SHOP: "SHOP",
  SETTINGS: "SETTINGS",
  RECORDS: "RECORDS",
};

export function makeMachine(initial = S.BOOT) {
  let cur = initial;
  const subs = [];
  return {
    get current() {
      return cur;
    },
    is(s) {
      return cur === s;
    },
    set(s) {
      if (s === cur) return;
      const prev = cur;
      cur = s;
      for (const f of subs) f(s, prev);
    },
    onChange(f) {
      subs.push(f);
      return () => {
        const i = subs.indexOf(f);
        if (i >= 0) subs.splice(i, 1);
      };
    },
  };
}
