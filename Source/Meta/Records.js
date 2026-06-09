// Local leaderboard logic. Entries live flat in the save; boards are derived by
// key (run length × standard/endless × normal/hard). Standard runs rank by
// victory-then-kills (faster wins break ties); Endless ranks by score.
export const BOARD_CAP = 10;

export function boardKey(e) {
  return (
    e.runLength +
    ":" +
    (e.endless ? "endless" : "standard") +
    ":" +
    (e.hard ? "hard" : "normal")
  );
}

export function compareEntries(a, b) {
  if (a.endless || b.endless)
    return (b.score || 0) - (a.score || 0) || (b.time || 0) - (a.time || 0);
  if (!!a.won !== !!b.won) return a.won ? -1 : 1;
  if ((b.kills || 0) !== (a.kills || 0)) return (b.kills || 0) - (a.kills || 0);
  // Wins: faster boss kill ranks higher. Losses: longer survival ranks higher.
  return a.won ? (a.time || 0) - (b.time || 0) : (b.time || 0) - (a.time || 0);
}

export function topFor(records, key, n = BOARD_CAP) {
  return records
    .filter((e) => boardKey(e) === key)
    .sort(compareEntries)
    .slice(0, n);
}

// Insert + prune: keep only entries that still make their board's top N.
// Returns whether the new entry placed.
export function insertEntry(records, entry, n = BOARD_CAP) {
  records.push(entry);
  const key = boardKey(entry);
  const top = topFor(records, key, n);
  for (let i = records.length - 1; i >= 0; i--)
    if (boardKey(records[i]) === key && !top.includes(records[i]))
      records.splice(i, 1);
  return top.includes(entry);
}
