import {describe, expect, expectTypeOf, it} from "vitest";
import {renderDiffValue, type JsonValue} from "./catalog-diff-renderer";

describe("merchant-safe structural diff value rendering", () => {
  it("uses a strict valid-JSON object type", () => {
    expectTypeOf<{value: undefined}>().not.toMatchTypeOf<JsonValue>();
    expectTypeOf<{value: null}>().toMatchTypeOf<JsonValue>();
  });

  it("distinguishes missing from JSON null and rejects invalid present undefined", () => {
    expect(renderDiffValue(undefined, false)).toEqual({kind: "missing", text: "Missing", truncated: false});
    expect(renderDiffValue(null, true)).toEqual({kind: "null", text: "null", truncated: false});
    expect(() => renderDiffValue(undefined, true)).toThrowError("A present diff value must be valid JSON");
  });

  it("renders canonical object keys in lexicographic order deterministically", () => {
    const value = {z: 1, a: {d: 2, b: 1}};
    const expected = 'Object (2 keys): {"a":{"b":1,"d":2},"z":1}';
    expect(renderDiffValue(value, true).text).toBe(expected);
    expect(renderDiffValue(value, true).text).toBe(expected);
  });

  it("renders arrays positionally and summarizes arrays and objects", () => {
    expect(renderDiffValue([3, {b: 2, a: 1}], true).text)
      .toBe('Array (2 items): [3,{"a":1,"b":2}]');
    expect(renderDiffValue({a: 1, b: 2}, true).text).toBe('Object (2 keys): {"a":1,"b":2}');
  });

  it.each([
    [0, 1], [-10, 1], [4.9, 4], [Number.NaN, 500], [Number.POSITIVE_INFINITY, 500],
  ])("normalizes maxLength %s and never exceeds %s characters", (maxLength, expectedLength) => {
    const result = renderDiffValue("x".repeat(600), true, maxLength);
    expect(result.truncated).toBe(true);
    expect(result.text).toHaveLength(expectedLength);
    expect(result.text.endsWith("…")).toBe(true);
  });

  it("keeps truncation within the normalized limit and preserves exact-fit output", () => {
    const truncated = renderDiffValue("abcdefgh", true, 5);
    expect(truncated).toEqual({kind: "scalar", text: '"abc…', truncated: true});
    expect(truncated.text.length).toBeLessThanOrEqual(5);
    expect(renderDiffValue("abc", true, 5)).toEqual({kind: "scalar", text: '"abc"', truncated: false});
  });
});
