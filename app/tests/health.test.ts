import {describe, expect, it} from "vitest";
import {loader} from "../routes/health";

describe("health route", () => {
  it("returns only a bounded, non-cacheable liveness response", async () => {
    const response = loader();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe('{"status":"ok"}');
  });
});
