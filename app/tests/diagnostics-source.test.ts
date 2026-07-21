import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";

describe("internal catalog diagnostics", () => {
  it("renders catalog metadata without exposing the retained raw payload", () => {
    const route = readFileSync(new URL("../routes/app.diagnostics.tsx", import.meta.url), "utf8");

    expect(route).toContain("event.resourceType");
    expect(route).toContain("event.shop");
    expect(route).toContain("event.resourceId");
    expect(route).toContain("event.payloadHash");
    expect(route).not.toMatch(/event\.payload(?!Hash)/);
  });
});
