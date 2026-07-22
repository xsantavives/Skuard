export type CatalogResourceType = "PRODUCT" | "COLLECTION";

export interface CatalogDiffEntryLike {
  path: string;
}

export const CATALOG_CHANGE_CATEGORIES = [
  "PRODUCT_CONTENT", "PRODUCT_IDENTITY", "PRODUCT_ORGANIZATION", "PRODUCT_PUBLICATION",
  "PRODUCT_OPTIONS", "VARIANT_DATA", "PRODUCT_MEDIA", "COLLECTION_CONTENT", "COLLECTION_IDENTITY",
  "COLLECTION_ORGANIZATION", "COLLECTION_PUBLICATION", "COLLECTION_RULES", "COLLECTION_MEDIA",
  "SYSTEM_METADATA", "OTHER",
] as const;

export type CatalogChangeCategory = (typeof CATALOG_CHANGE_CATEGORIES)[number];

export interface CatalogChangeClassification {
  category: CatalogChangeCategory;
  label: string;
  normalizedPath: string;
}

export interface CatalogChangeSummary {
  category: CatalogChangeCategory;
  label: string;
  count: number;
}

const LABELS: Record<CatalogChangeCategory, string> = {
  PRODUCT_CONTENT: "Product content",
  PRODUCT_IDENTITY: "Product identity",
  PRODUCT_ORGANIZATION: "Product organization",
  PRODUCT_PUBLICATION: "Product publication",
  PRODUCT_OPTIONS: "Product options",
  VARIANT_DATA: "Variant data",
  PRODUCT_MEDIA: "Product media",
  COLLECTION_CONTENT: "Collection content",
  COLLECTION_IDENTITY: "Collection identity",
  COLLECTION_ORGANIZATION: "Collection organization",
  COLLECTION_PUBLICATION: "Collection publication",
  COLLECTION_RULES: "Collection rules",
  COLLECTION_MEDIA: "Collection media",
  SYSTEM_METADATA: "System metadata",
  OTHER: "Other",
};

export interface ParsedCatalogChangePath {valid: boolean; segments: string[]; normalizedPath: string}

/** Parses RFC 6901 and normalizes complete decimal segments for classification. */
export function parseCatalogChangePath(path: string): ParsedCatalogChangePath {
  if (path === "") return {valid: true, segments: [], normalizedPath: ""};
  if (!path.startsWith("/")) return {valid: false, segments: [], normalizedPath: path};
  const encodedSegments = path.slice(1).split("/");
  const segments: string[] = [];
  for (const encoded of encodedSegments) {
    if (/~(?:[^01]|$)/u.test(encoded)) return {valid: false, segments: [], normalizedPath: path};
    segments.push(encoded.replaceAll("~1", "/").replaceAll("~0", "~"));
  }
  const normalizedPath = `/${segments.map((segment) => {
    const normalized = /^\d+$/u.test(segment) ? "*" : segment;
    return normalized.replaceAll("~", "~0").replaceAll("/", "~1");
  }).join("/")}`;
  return {valid: true, segments, normalizedPath};
}

/** Normalizes complete decimal path segments without changing invalid pointers. */
export function normalizeCatalogChangePath(path: string): string {
  return parseCatalogChangePath(path).normalizedPath;
}

const CONTENT = new Set(["title", "body_html", "description", "description_html", "template_suffix"]);
const IDENTITY = new Set(["id", "admin_graphql_api_id", "handle"]);
const METADATA = new Set(["created_at", "updated_at"]);

function categoryFor(resourceType: CatalogResourceType, parsed: ParsedCatalogChangePath): CatalogChangeCategory {
  if (!parsed.valid || parsed.segments.length === 0) return "OTHER";
  const [root] = parsed.segments;
  if (parsed.segments.length === 1 && METADATA.has(root!)) return "SYSTEM_METADATA";
  if (resourceType === "PRODUCT") {
    if (parsed.segments.length === 1 && CONTENT.has(root!)) return "PRODUCT_CONTENT";
    if (parsed.segments.length === 1 && IDENTITY.has(root!)) return "PRODUCT_IDENTITY";
    if (parsed.segments.length === 1 && new Set(["vendor", "product_type", "tags"]).has(root!)) return "PRODUCT_ORGANIZATION";
    if (parsed.segments.length === 1 && new Set(["status", "published_at", "published_scope"]).has(root!)) return "PRODUCT_PUBLICATION";
    if (root === "options") return "PRODUCT_OPTIONS";
    if (root === "variants") return "VARIANT_DATA";
    if (root === "image" || root === "images") return "PRODUCT_MEDIA";
    return "OTHER";
  }
  if (parsed.segments.length === 1 && CONTENT.has(root!)) return "COLLECTION_CONTENT";
  if (parsed.segments.length === 1 && IDENTITY.has(root!)) return "COLLECTION_IDENTITY";
  if (parsed.segments.length === 1 && root === "sort_order") return "COLLECTION_ORGANIZATION";
  if (parsed.segments.length === 1 && (root === "published_at" || root === "published_scope")) return "COLLECTION_PUBLICATION";
  if (root === "rules" || (parsed.segments.length === 1 && root === "disjunctive")) return "COLLECTION_RULES";
  if (root === "image") return "COLLECTION_MEDIA";
  return "OTHER";
}

export function classifyCatalogDiffEntry(
  resourceType: CatalogResourceType,
  entry: CatalogDiffEntryLike,
): CatalogChangeClassification {
  const parsed = parseCatalogChangePath(entry.path);
  const category = categoryFor(resourceType, parsed);
  return {category, label: LABELS[category], normalizedPath: parsed.normalizedPath};
}

export function summarizeCatalogChangeClassifications(
  resourceType: CatalogResourceType,
  entries: readonly CatalogDiffEntryLike[],
): CatalogChangeSummary[] {
  const counts = new Map<CatalogChangeCategory, number>();
  for (const entry of entries) {
    const {category} = classifyCatalogDiffEntry(resourceType, entry);
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return CATALOG_CHANGE_CATEGORIES.flatMap((category) => {
    const count = counts.get(category);
    return count ? [{category, label: LABELS[category], count}] : [];
  });
}
