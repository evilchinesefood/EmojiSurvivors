import { describe, it, expect } from "./Runner.js";

describe("Smoke", () => {
  it("harness runs", () => {
    expect(1 + 1).toBe(2);
  });
});
