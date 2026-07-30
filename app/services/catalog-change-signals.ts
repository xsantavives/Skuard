import {
  classifyCatalogDiffEntry,
  parseCatalogChangePath,
  type CatalogChangeCategory,
  type CatalogResourceType,
} from "./catalog-change-taxonomy";

export type JsonValue = null | boolean | number | string | JsonValue[] | {[key: string]: JsonValue};
export type CatalogDiffOperation = "ADDED" | "REMOVED" | "CHANGED";
export interface CatalogChangeSignalEntry {
  path: string;
  operation: CatalogDiffOperation;
  before?: JsonValue;
  after?: JsonValue;
}

export const CATALOG_CHANGE_SIGNAL_CODES = [
  "PRODUCT_TITLE_CHANGED", "PRODUCT_HANDLE_CHANGED", "PRODUCT_STATUS_CHANGED",
  "PRODUCT_PUBLICATION_CHANGED", "PRODUCT_VENDOR_CHANGED", "PRODUCT_TYPE_CHANGED",
  "PRODUCT_TAGS_CHANGED", "PRODUCT_OPTIONS_CHANGED", "VARIANT_PRICE_CHANGED",
  "VARIANT_COMPARE_AT_PRICE_CHANGED", "VARIANT_SKU_CHANGED", "VARIANT_BARCODE_CHANGED",
  "PRODUCT_MEDIA_CHANGED", "COLLECTION_TITLE_CHANGED", "COLLECTION_HANDLE_CHANGED",
  "COLLECTION_PUBLICATION_CHANGED", "COLLECTION_SORT_ORDER_CHANGED", "COLLECTION_RULES_CHANGED",
  "COLLECTION_MEDIA_CHANGED",
] as const;

export type CatalogChangeSignalCode = (typeof CATALOG_CHANGE_SIGNAL_CODES)[number];
interface CatalogChangeSignalBase {
  code: CatalogChangeSignalCode;
  label: string;
  category: CatalogChangeCategory;
}
export interface StructuralPathSignal extends CatalogChangeSignalBase {
  evidenceKind: "STRUCTURAL_PATH";
  path: string;
  normalizedPath: string;
  operation: CatalogDiffOperation;
  before?: JsonValue;
  after?: JsonValue;
}
export interface VariantPricingSignal extends CatalogChangeSignalBase {
  evidenceKind: "VARIANT_PRICING";
  variantId: string;
  field: "PRICE" | "COMPARE_AT_PRICE";
  before: string | null;
  after: string | null;
  transition: "CHANGED" | "SET" | "CLEARED";
}
export type CatalogChangeSignal = StructuralPathSignal | VariantPricingSignal;
export interface CatalogChangeSignalSummary {code: CatalogChangeSignalCode; label: string; count: number}

const LABELS: Record<CatalogChangeSignalCode, string> = {
  PRODUCT_TITLE_CHANGED: "Product title changed",
  PRODUCT_HANDLE_CHANGED: "Product handle changed",
  PRODUCT_STATUS_CHANGED: "Product status changed",
  PRODUCT_PUBLICATION_CHANGED: "Product publication changed",
  PRODUCT_VENDOR_CHANGED: "Product vendor changed",
  PRODUCT_TYPE_CHANGED: "Product type changed",
  PRODUCT_TAGS_CHANGED: "Product tags changed",
  PRODUCT_OPTIONS_CHANGED: "Product options changed",
  VARIANT_PRICE_CHANGED: "Variant price changed",
  VARIANT_COMPARE_AT_PRICE_CHANGED: "Variant compare-at price changed",
  VARIANT_SKU_CHANGED: "Variant SKU changed",
  VARIANT_BARCODE_CHANGED: "Variant barcode changed",
  PRODUCT_MEDIA_CHANGED: "Product media changed",
  COLLECTION_TITLE_CHANGED: "Collection title changed",
  COLLECTION_HANDLE_CHANGED: "Collection handle changed",
  COLLECTION_PUBLICATION_CHANGED: "Collection publication changed",
  COLLECTION_SORT_ORDER_CHANGED: "Collection sort order changed",
  COLLECTION_RULES_CHANGED: "Collection rules changed",
  COLLECTION_MEDIA_CHANGED: "Collection media changed",
};

const rootedAt = (path: string, root: string) => path === root || path.startsWith(`${root}/`);

function matchProduct(path: string): CatalogChangeSignalCode | undefined {
  if (path === "/title") return "PRODUCT_TITLE_CHANGED";
  if (path === "/handle") return "PRODUCT_HANDLE_CHANGED";
  if (path === "/status") return "PRODUCT_STATUS_CHANGED";
  if (path === "/published_at" || path === "/published_scope") return "PRODUCT_PUBLICATION_CHANGED";
  if (path === "/vendor") return "PRODUCT_VENDOR_CHANGED";
  if (path === "/product_type") return "PRODUCT_TYPE_CHANGED";
  if (rootedAt(path, "/tags")) return "PRODUCT_TAGS_CHANGED";
  if (rootedAt(path, "/options")) return "PRODUCT_OPTIONS_CHANGED";
  if (path === "/variants/*/sku") return "VARIANT_SKU_CHANGED";
  if (path === "/variants/*/barcode") return "VARIANT_BARCODE_CHANGED";
  if (rootedAt(path, "/image") || rootedAt(path, "/images")) return "PRODUCT_MEDIA_CHANGED";
}

function matchCollection(path: string): CatalogChangeSignalCode | undefined {
  if (path === "/title") return "COLLECTION_TITLE_CHANGED";
  if (path === "/handle") return "COLLECTION_HANDLE_CHANGED";
  if (path === "/published_at" || path === "/published_scope") return "COLLECTION_PUBLICATION_CHANGED";
  if (path === "/sort_order") return "COLLECTION_SORT_ORDER_CHANGED";
  if (path === "/disjunctive" || rootedAt(path, "/rules")) return "COLLECTION_RULES_CHANGED";
  if (rootedAt(path, "/image")) return "COLLECTION_MEDIA_CHANGED";
}

export function deriveCatalogChangeSignals(
  resourceType: CatalogResourceType,
  entries: readonly CatalogChangeSignalEntry[],
): CatalogChangeSignal[] {
  return entries.flatMap((entry) => {
    const parsed = parseCatalogChangePath(entry.path);
    if (!parsed.valid || parsed.segments.length === 0) return [];
    const code = resourceType === "PRODUCT" ? matchProduct(parsed.normalizedPath) : matchCollection(parsed.normalizedPath);
    if (!code) return [];
    const {category} = classifyCatalogDiffEntry(resourceType, entry);
    return [{...entry, evidenceKind: "STRUCTURAL_PATH" as const, code, label: LABELS[code], category,
      normalizedPath: parsed.normalizedPath}];
  });
}

export function summarizeCatalogChangeSignals(
  signals: readonly CatalogChangeSignal[],
): CatalogChangeSignalSummary[] {
  const counts = new Map<CatalogChangeSignalCode, number>();
  for (const signal of signals) counts.set(signal.code, (counts.get(signal.code) ?? 0) + 1);
  return CATALOG_CHANGE_SIGNAL_CODES.flatMap((code) => {
    const count = counts.get(code);
    return count ? [{code, label: LABELS[code], count}] : [];
  });
}
