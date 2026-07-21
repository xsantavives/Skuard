import {createHash} from "node:crypto";

export type JsonValue = null | boolean | number | string | JsonValue[] | {[key: string]: JsonValue | undefined};

export function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value)
    .filter((key) => value[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key] as JsonValue)}`)
    .join(",")}}`;
}

export function hashCanonicalPayload(payload: string) {
  return createHash("sha256").update(payload).digest("hex");
}

export function payloadHash(payload: JsonValue) {
  return hashCanonicalPayload(canonicalJson(payload));
}
