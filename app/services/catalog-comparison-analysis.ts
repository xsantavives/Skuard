import type {CatalogResourceType} from "./catalog-change-taxonomy";
import {deriveCatalogChangeSignals, type CatalogChangeSignal} from "./catalog-change-signals";
import {deriveCatalogComparisonFindings} from "./catalog-comparison-findings";
import {DEFAULT_CATALOG_DIFF_LIMITS, diffCanonicalJson, type CatalogDiffLimits} from "./catalog-structural-diff";
import type {JsonValue} from "./catalog-json.server";

export const DEFAULT_PRICING_EVIDENCE_LIMITS = {maxVariantDetails: 250, maxExpectedVariantIds: 500, maxChanges: 200} as const;
export interface PricingEvidenceLimits {maxVariantDetails: number; maxExpectedVariantIds: number; maxChanges: number}
export type PricingCoverageStatus = "COMPLETE" | "PARTIAL" | "UNVERIFIED";
export type PricingField = "PRICE" | "COMPARE_AT_PRICE";
export type PricingTransition = "CHANGED" | "SET" | "CLEARED";
export interface VariantPricingChange {variantId: string; title?: string; sku?: string; field: PricingField;
  before: string | null; after: string | null; transition: PricingTransition}
export interface SnapshotPricingCoverage {status: PricingCoverageStatus; expectedIdentityCount: number;
  detailedIdentityCount: number; expectedMissingDetailCount: number; unexpectedDetailedIdentityCount: number; limited: boolean}
export interface PricingCoverage {status: PricingCoverageStatus; previous: SnapshotPricingCoverage;
  current: SnapshotPricingCoverage; matchedDetailedVariantCount: number; returnedPricingChangeCount: number;
  changesTruncated: boolean; limited: boolean}

type Variant = {id: string; title?: string; sku?: string; price?: Money; compareAt?: Money};
type Money = {recorded: string | null; canonical: string | null};
type Parsed = {variants: Map<string, Variant>; coverage: SnapshotPricingCoverage; valid: boolean};
const object = (value: JsonValue): value is {[key: string]: JsonValue} => !!value && typeof value === "object" && !Array.isArray(value);
const label = (value: JsonValue | undefined) => typeof value === "string" && value.trim() ? value.slice(0, 120) : undefined;
const PRODUCT_VARIANT_GID = "gid://shopify/ProductVariant/";
const scalarIdentity = (value: JsonValue | undefined): string | undefined => {
  let numericId: string;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value <= 0) return undefined;
    numericId = String(value);
  } else if (typeof value === "string") {
    const candidate = value.startsWith(PRODUCT_VARIANT_GID) ? value.slice(PRODUCT_VARIANT_GID.length) : value;
    if (!/^[1-9]\d*$/.test(candidate)) return undefined;
    numericId = candidate;
  } else return undefined;
  return `${PRODUCT_VARIANT_GID}${numericId}`;
};

/** Parse the only accepted ProductVariant identities without consulting descriptive fields. */
export const canonicalProductVariantIdentity = (value: JsonValue): string | undefined => {
  if (!object(value)) return scalarIdentity(value);
  const hasGid = Object.prototype.hasOwnProperty.call(value, "admin_graphql_api_id");
  const hasId = Object.prototype.hasOwnProperty.call(value, "id");
  if (!hasGid && !hasId) return undefined;
  const gid = hasGid ? scalarIdentity(value.admin_graphql_api_id) : undefined;
  const id = hasId ? scalarIdentity(value.id) : undefined;
  if ((hasGid && !gid) || (hasId && !id) || (gid && id && gid !== id)) return undefined;
  return gid ?? id;
};
const money = (value: JsonValue | undefined, nullable: boolean): Money | undefined => {
  if (value === null && nullable) return {recorded: null, canonical: null};
  if (typeof value !== "string" || !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) return undefined;
  const negative = value.startsWith("-"); const [whole, fraction = ""] = (negative ? value.slice(1) : value).split(".");
  const trimmed = fraction.replace(/0+$/, ""); const zero = whole === "0" && !trimmed;
  return {recorded: value, canonical: `${negative && !zero ? "-" : ""}${whole}${trimmed ? `.${trimmed}` : ""}`};
};
function parse(state: JsonValue, limits: PricingEvidenceLimits): Parsed {
  const variants = new Map<string, Variant>(); const root = object(state) ? state : undefined;
  let valid = !!root && Array.isArray(root.variants); let limited = false;
  const details = valid ? root!.variants as JsonValue[] : [];
  if (details.length > Math.max(0, limits.maxVariantDetails)) {limited = true; valid = false;}
  for (const raw of details.slice(0, Math.max(0, limits.maxVariantDetails))) {
    if (!object(raw)) {valid = false; continue;} const id = canonicalProductVariantIdentity(raw);
    if (!id || variants.has(id)) {valid = false; continue;}
    const price = money(raw.price, false); const compareAt = money(raw.compare_at_price, true);
    if (!price || !compareAt) {valid = false; continue;}
    variants.set(id, {id, title: label(raw.title), sku: label(raw.sku), price, compareAt});
  }
  let expected: Set<string> | undefined;
  if (root && Object.prototype.hasOwnProperty.call(root, "variant_gids") && !Array.isArray(root.variant_gids)) valid = false;
  if (root && Array.isArray(root.variant_gids)) {
    expected = new Set();
    if (root.variant_gids.length > Math.max(0, limits.maxExpectedVariantIds)) {limited = true; valid = false;}
    for (const raw of root.variant_gids.slice(0, Math.max(0, limits.maxExpectedVariantIds))) {
      const id = canonicalProductVariantIdentity(raw); if (!id || expected.has(id)) valid = false; else expected.add(id);
    }
  }
  const missing = expected ? [...expected].filter((id) => !variants.has(id)).length : undefined;
  const unexpected = expected ? [...variants.keys()].filter((id) => !expected.has(id)).length : 0;
  const status: PricingCoverageStatus = limited || !valid || !expected || unexpected ? "UNVERIFIED" : missing ? "PARTIAL" : "COMPLETE";
  if (unexpected) valid = false;
  return {variants, valid, coverage: {status, expectedIdentityCount: expected?.size ?? 0,
    detailedIdentityCount: variants.size, expectedMissingDetailCount: missing ?? 0,
    unexpectedDetailedIdentityCount: unexpected, limited}};
}
const rank = (status: PricingCoverageStatus) => ({UNVERIFIED: 0, PARTIAL: 1, COMPLETE: 2})[status];

export function deriveVariantPricingEvidence(previous: JsonValue, current: JsonValue,
  limits: PricingEvidenceLimits = DEFAULT_PRICING_EVIDENCE_LIMITS) {
  const before = parse(previous, limits); const after = parse(current, limits); const changes: VariantPricingChange[] = [];
  const matched = [...before.variants.keys()].filter((id) => after.variants.has(id)).sort(); let changesTruncated = false;
  if (before.valid && after.valid) for (const id of matched) for (const field of ["PRICE", "COMPARE_AT_PRICE"] as const) {
    const oldMoney = field === "PRICE" ? before.variants.get(id)!.price! : before.variants.get(id)!.compareAt!;
    const newMoney = field === "PRICE" ? after.variants.get(id)!.price! : after.variants.get(id)!.compareAt!;
    if (oldMoney.canonical === newMoney.canonical) continue;
    if (changes.length >= Math.max(0, limits.maxChanges)) {changesTruncated = true; continue;}
    const variant = after.variants.get(id)!;
    changes.push({variantId: id, ...(variant.title ? {title: variant.title} : {}), ...(variant.sku ? {sku: variant.sku} : {}),
      field, before: oldMoney.recorded, after: newMoney.recorded,
      transition: oldMoney.recorded === null ? "SET" : newMoney.recorded === null ? "CLEARED" : "CHANGED"});
  }
  let status = rank(before.coverage.status) <= rank(after.coverage.status) ? before.coverage.status : after.coverage.status;
  const limited = before.coverage.limited || after.coverage.limited || changesTruncated;
  if (limited) status = "UNVERIFIED";
  return {changes, coverage: {status, previous: before.coverage, current: after.coverage,
    matchedDetailedVariantCount: matched.length, returnedPricingChangeCount: changes.length, changesTruncated, limited} satisfies PricingCoverage};
}

export function analyzeCatalogComparison(resourceType: CatalogResourceType, previous: JsonValue, current: JsonValue,
  limits: {structural?: CatalogDiffLimits; pricing?: PricingEvidenceLimits} = {}) {
  const structural = diffCanonicalJson(previous, current, limits.structural ?? DEFAULT_CATALOG_DIFF_LIMITS);
  const pricing = resourceType === "PRODUCT" ? deriveVariantPricingEvidence(previous, current, limits.pricing) : undefined;
  const signals: CatalogChangeSignal[] = deriveCatalogChangeSignals(resourceType, structural.entries);
  if (pricing) for (const change of pricing.changes) signals.push({code: change.field === "PRICE" ? "VARIANT_PRICE_CHANGED" : "VARIANT_COMPARE_AT_PRICE_CHANGED",
    label: change.field === "PRICE" ? "Variant price changed" : "Variant compare-at price changed", category: "VARIANT_DATA",
    evidenceKind: "VARIANT_PRICING", variantId: change.variantId, field: change.field,
    before: change.before, after: change.after, transition: change.transition});
  return {structural, signals, findings: deriveCatalogComparisonFindings(resourceType, signals, {truncated: structural.truncated}), pricing};
}
