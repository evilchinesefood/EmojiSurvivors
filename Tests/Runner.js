// Zero-dependency test harness. No npm, no transpile. Plain ES module.

const registry = []; // flat list of { path:string[], name, fn }
const suiteStack = [];

export function describe(name, fn) {
  suiteStack.push(name);
  fn();
  suiteStack.pop();
}

export function it(name, fn) {
  registry.push({ path: suiteStack.slice(), name, fn });
}

function deepEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (
    typeof a !== "object" ||
    typeof b !== "object" ||
    a === null ||
    b === null
  )
    return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!deepEqual(a[k], b[k])) return false;
  }
  return true;
}

function show(v) {
  try {
    return typeof v === "string" ? JSON.stringify(v) : String(v);
  } catch {
    return "<unprintable>";
  }
}

export function expect(actual) {
  return {
    toBe(expected) {
      if (!Object.is(actual, expected)) {
        throw new Error(`expected ${show(actual)} to be ${show(expected)}`);
      }
    },
    toEqual(expected) {
      if (!deepEqual(actual, expected)) {
        throw new Error(
          `expected ${show(actual)} to deep-equal ${show(expected)}`,
        );
      }
    },
    toBeCloseTo(expected, epsilon = 1e-9) {
      if (typeof actual !== "number" || Math.abs(actual - expected) > epsilon) {
        throw new Error(
          `expected ${show(actual)} to be within ${epsilon} of ${show(expected)}`,
        );
      }
    },
    toThrow(matcher) {
      if (typeof actual !== "function") {
        throw new Error(`toThrow expects a function, got ${show(actual)}`);
      }
      let threw = false;
      let err;
      try {
        actual();
      } catch (e) {
        threw = true;
        err = e;
      }
      if (!threw) throw new Error(`expected function to throw`);
      if (matcher != null) {
        const msg =
          err && err.message != null ? String(err.message) : String(err);
        if (typeof matcher === "string" && !msg.includes(matcher)) {
          throw new Error(
            `expected thrown message ${show(msg)} to include ${show(matcher)}`,
          );
        }
        if (matcher instanceof RegExp && !matcher.test(msg)) {
          throw new Error(
            `expected thrown message ${show(msg)} to match ${matcher}`,
          );
        }
      }
    },
    toBeTruthy() {
      if (!actual) throw new Error(`expected ${show(actual)} to be truthy`);
    },
  };
}

// Pure runner over an explicit list of { label, fn }. Logs ok/FAIL per test and
// returns { passed, failed, total }. Does NOT touch the global registry or process.exitCode.
export async function runList(tests) {
  let passed = 0;
  let failed = 0;
  let ran = 0;
  for (const t of tests) {
    ran++;
    try {
      await t.fn();
      passed++;
      console.log(`ok   ${t.label}`);
    } catch (e) {
      failed++;
      console.log(`FAIL ${t.label}`);
      console.log(`     ${e && e.message ? e.message : e}`);
    }
  }
  return { passed, failed, total: ran };
}

export async function run(filter) {
  const needle = filter ? String(filter).toLowerCase() : null;
  const tests = registry
    .map((t) => ({ label: [...t.path, t.name].join(" › "), fn: t.fn }))
    .filter((t) => !needle || t.label.toLowerCase().includes(needle));
  const { passed, failed, total } = await runList(tests);
  console.log(
    `\n${passed} passed, ${failed} failed, ${total} total${needle ? ` (filter: ${filter})` : ""}`,
  );
  if (failed > 0) process.exitCode = 1;
  return { passed, failed, total };
}
