export type JsonValue = null | boolean | number | string | JsonValue[] | {[key: string]: JsonValue};

export const DEFAULT_CATALOG_DIFF_LIMITS = {maxDepth: 32, maxVisitedNodes: 20_000, maxEntries: 200} as const;
export interface CatalogDiffLimits {maxDepth: number; maxVisitedNodes: number; maxEntries: number}
export type CatalogDiffOperation = "ADDED" | "REMOVED" | "CHANGED";
export interface CatalogDiffEntry {path: string; operation: CatalogDiffOperation; before?: JsonValue; after?: JsonValue}
export interface JsonDiffResult {entries: CatalogDiffEntry[]; truncated: boolean; visitedNodes: number}

const jsonType = (value: JsonValue) => value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
const childPath = (path: string, key: string) => `${path}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`;

export function diffCanonicalJson(previous: JsonValue, current: JsonValue,
  limits: CatalogDiffLimits = DEFAULT_CATALOG_DIFF_LIMITS): JsonDiffResult {
  const entries: CatalogDiffEntry[] = []; let visitedNodes = 0; let truncated = false;
  const add = (entry: CatalogDiffEntry) => {
    if (entries.length >= Math.max(0, limits.maxEntries)) { truncated = true; return; }
    entries.push(entry);
  };
  const walk = (before: JsonValue, after: JsonValue, path: string, depth: number) => {
    if (truncated || depth > limits.maxDepth || visitedNodes >= limits.maxVisitedNodes) { truncated = true; return; }
    visitedNodes += 1;
    const beforeType = jsonType(before); const afterType = jsonType(after);
    if (beforeType !== afterType) { add({path, operation: "CHANGED", before, after}); return; }
    if (Array.isArray(before) && Array.isArray(after)) {
      for (let index = 0; index < Math.max(before.length, after.length) && !truncated; index += 1) {
        const indexedPath = childPath(path, String(index));
        if (index >= before.length) add({path: indexedPath, operation: "ADDED", after: after[index]!});
        else if (index >= after.length) add({path: indexedPath, operation: "REMOVED", before: before[index]!});
        else walk(before[index]!, after[index]!, indexedPath, depth + 1);
      }
      return;
    }
    if (beforeType === "object") {
      const oldObject = before as Record<string, JsonValue>; const newObject = after as Record<string, JsonValue>;
      const keys = [...new Set([...Object.keys(oldObject), ...Object.keys(newObject)])].sort();
      for (const key of keys) {
        if (truncated) break;
        const hasBefore = Object.prototype.hasOwnProperty.call(oldObject, key);
        const hasAfter = Object.prototype.hasOwnProperty.call(newObject, key); const keyedPath = childPath(path, key);
        if (!hasBefore) add({path: keyedPath, operation: "ADDED", after: newObject[key]!});
        else if (!hasAfter) add({path: keyedPath, operation: "REMOVED", before: oldObject[key]!});
        else walk(oldObject[key]!, newObject[key]!, keyedPath, depth + 1);
      }
      return;
    }
    if (before !== after) add({path, operation: "CHANGED", before, after});
  };
  walk(previous, current, "", 0); return {entries, truncated, visitedNodes};
}
