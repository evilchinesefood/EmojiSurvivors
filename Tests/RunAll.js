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

run(process.argv[2]);
