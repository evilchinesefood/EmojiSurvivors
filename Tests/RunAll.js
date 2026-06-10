// Imports every Tests/*.Test.js so they register, then runs the harness.
// Static import list (buildless ESM — no fs glob). Append new suites here.
import { run } from "./Runner.js";

import "./Smoke.Test.js";
import "./Rng.Test.js";
import "./StatsModel.Test.js";
import "./Curve.Test.js";
import "./Movement.Test.js";
import "./SpatialHash.Test.js";
import "./Spawner.Test.js";
import "./Combat.Test.js";
import "./Pickup.Test.js";
import "./Leveling.Test.js";
import "./Evolutions.Test.js";
import "./Boss.Test.js";
import "./Save.Test.js";
import "./Meta.Test.js";
import "./Content.Test.js";
import "./Modifiers.Test.js";
import "./Tamper.Test.js";
import "./Records.Test.js";
import "./Expansion.Test.js";
import "./FireGate.Test.js";
import "./Allies.Test.js";
import "./Protocol.Test.js";
import "./Screens.Test.js";
import "./SharedSave.Test.js";

run(process.argv[2]);
