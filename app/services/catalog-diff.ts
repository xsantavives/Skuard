export type JsonValue = null | boolean | number | string | JsonValue[] | {[key: string]: JsonValue | undefined};
function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key]!)}`).join(",")}}`;
}

export interface RenderedDiffValue {kind: "missing" | "null" | "scalar" | "array" | "object"; text: string; truncated: boolean}
export function renderDiffValue(value: JsonValue | undefined, present: boolean, maxLength = 500): RenderedDiffValue {
  if (!present) return {kind: "missing", text: "Missing", truncated: false};
  const kind = value === null ? "null" : Array.isArray(value) ? "array" : typeof value === "object" ? "object" : "scalar";
  const prefix = Array.isArray(value) ? `Array (${value.length} items): ` :
    value !== null && typeof value === "object" ? `Object (${Object.keys(value).length} keys): ` : "";
  const serialized = canonicalJson(value!); const available = Math.max(0, maxLength - prefix.length - 1);
  const truncated = prefix.length + serialized.length > maxLength;
  return {kind, text: truncated ? `${prefix}${serialized.slice(0, available)}…` : `${prefix}${serialized}`, truncated};
}
