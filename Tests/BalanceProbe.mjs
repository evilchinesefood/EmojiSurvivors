// Tuning harness (not part of npm test). Reuses SimProbe's canonical kiting +
// priority-pick policy to sweep every character over a run and print a balance table.
// Usage: node Tests/BalanceProbe.mjs [runLength]
import { createRunState } from "../Source/Engine/State.js";
import { stepSim, STEP } from "../Source/Engine/GameLoop.js";
import { CHARACTERS, CHARACTER_IDS } from "../Source/Content/Characters.js";
import { moveAI, smartPick } from "./SimProbe.mjs";

function playRun(characterId, runLength, seed = 1234) {
  const s = createRunState({
    seed,
    runLength,
    character: CHARACTERS[characterId],
    powerGrid: {},
  });
  const steps = Math.round((runLength + 60) / STEP);
  for (let i = 0; i < steps; i++) {
    s.input.move = moveAI(s);
    stepSim(s, STEP);
    let g = 0;
    while (s.awaitingLevelUp) {
      smartPick(s);
      if (++g > 200) break;
    }
    s.events.length = 0;
    if (s.outcome) break;
  }
  return s;
}

const len = Number(process.argv[2] || 300);
for (const cid of CHARACTER_IDS) {
  const s = playRun(cid, len);
  console.log(
    `${cid.padEnd(10)} lvl=${String(s.player.level).padStart(2)} ` +
      `kills=${String(s.player.kills).padStart(4)} ` +
      `hp=${Math.max(0, s.player.hp).toFixed(0)}/${s.player.maxHp} ` +
      `t=${s.time.toFixed(0)}s ${s.outcome || "alive"} ` +
      `coins=${s.player.coins} [${s.player.weapons.map((w) => w.id + ":" + w.level).join(", ")}]`,
  );
}
