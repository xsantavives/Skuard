import {describe, expect, it} from "vitest";
import {foundationMessage} from "./FoundationContent";

describe("foundation environment", () => {
  it("runs tests and exposes an honest foundation message", () => {
    expect(foundationMessage).toContain("Foundation initialized");
    expect(foundationMessage).toContain("next product slice");
    expect(foundationMessage).not.toMatch(/monitoring (is|now)/i);
  });
});
