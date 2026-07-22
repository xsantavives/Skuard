export type JsonValue = null | boolean | number | string | JsonValue[] | {[key: string]: JsonValue};

function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key]!)}`).join(",")}}`;
}

export interface RenderedDiffValue {kind: "missing" | "null" | "scalar" | "array" | "object"; text: string; truncated: boolean}

export function renderDiffValue(value: JsonValue | undefined, present: boolean, maxLength = 500): RenderedDiffValue {
  if (!present) return {kind: "missing", text: "Missing", truncated: false};
  if (value === undefined) throw new TypeError("A present diff value must be valid JSON");

  const safeMaxLength = Number.isFinite(maxLength) ? Math.max(1, Math.floor(maxLength)) : 500;
  const kind = value === null ? "null" : Array.isArray(value) ? "array" : typeof value === "object" ? "object" : "scalar";
  const prefix = Array.isArray(value) ? `Array (${value.length} items): ` :
    value !== null && typeof value === "object" ? `Object (${Object.keys(value).length} keys): ` : "";
  const complete = `${prefix}${canonicalJson(value)}`;
  if (complete.length <= safeMaxLength) return {kind, text: complete, truncated: false};
  return {kind, text: `${complete.slice(0, safeMaxLength - 1)}…`, truncated: true};
}
