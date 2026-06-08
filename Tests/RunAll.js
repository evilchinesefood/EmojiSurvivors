// Imports every Tests/*.Test.js so they register, then runs the harness.
// Static import list (buildless ESM — no fs glob). Append new suites here.
import { run } from "./Runner.js";

import "./Smoke.Test.js";

run(process.argv[2]);
