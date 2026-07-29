import type {CatalogResourceType} from "./catalog-change-taxonomy";
import {deriveCatalogChangeSignals, type CatalogChangeSignal} from "./catalog-change-signals";
import {deriveCatalogComparisonFindings} from "./catalog-comparison-findings";
import {DEFAULT_CATALOG_DIFF_LIMITS, diffCanonicalJson, type CatalogDiffLimits} from "./catalog-diff.server";
import type {JsonValue} from "./catalog-json.server";

export const DEFAULT_PRICING_EVIDENCE_LIMITS = {maxVariantDetails: 250, maxExpectedVariantIds: 500, maxChanges: 200} as const;
export interface PricingEvidenceLimits {maxVariantDetails: number; maxExpectedVariantIds: number; maxChanges: number}
export type PricingCoverageStatus = "COMPLETE" | "PARTIAL" | "UNVERIFIED";
export type PricingField = "PRICE" | "COMPARE_AT_PRICE";
export type PricingTransition = "CHANGED" | "SET" | "CLEARED";
export interface VariantPricingChange {variantId: string; title?: string; sku?: string; field: PricingField;
  before: string | null; after: string | null; transition: PricingTransition}
export interface SnapshotPricingCoverage {status: PricingCoverageStatus; detailedVariantCount: number;
  expectedVariantCount?: number; missingDetailCount?: number; limited: boolean}
export interface PricingCoverage {status: PricingCoverageStatus; previous: SnapshotPricingCoverage;
  current: SnapshotPricingCoverage; matchedDetailedVariantCount: number; returnedPricingChangeCount: number;
  changesTruncated: boolean; limited: boolean}

type Variant = {id: string; title?: string; sku?: string; price?: Money; compareAt?: Money};
type Money = {recorded: string | null; canonical: string | null};
type Parsed = {variants: Map<string, Variant>; coverage: SnapshotPricingCoverage; valid: boolean};
const object = (value: JsonValue): value is {[key: string]: JsonValue} => !!value && typeof value === "object" && !Array.isArray(value);
const label = (value: JsonValue | undefined) => typeof value === "string" && value.trim() ? value.slice(0, 120) : undefined;
const identity = (value: {[key: string]: JsonValue}) => {
  const gid = value.admin_graphql_api_id;
  if (typeof gid === "string" && gid.trim()) return gid.trim();
  const id = value.id;
  return typeof id === "string" && id.trim() ? id.trim() : typeof id === "number" && Number.isSafeInteger(id) ? String(id) : undefined;
};
const money = (value: JsonValue | undefined, nullable: boolean): Money | undefined => {
  if (value === null && nullable) return {recorded: null, canonical: null};
  if (typeof value !== "string" || !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) return undefined;
  const negative = value.startsWith("-"); const [whole, fraction = ""] = (negative ? value.slice(1) : value).split(".");
  const trimmed = fraction.replace(/0+$/, ""); const zero = whole === "0" && !trimmed;
  return {recorded: value, canonical: `${negative && !zero ? "-" : ""}${whole}${trimmed ? `.${trimmed}` : ""}`};
};
const expectedIdentity = (value: JsonValue) => typeof value === "string" && value.trim() ? value.trim() :
  typeof value === "number" && Number.isSafeInteger(value) ? String(value) : object(value) ? identity(value) : undefined;

function parse(state: JsonValue, limits: PricingEvidenceLimits): Parsed {
  const variants = new Map<string, Variant>(); const root = object(state) ? state : undefined;
  let valid = !!root && Array.isArray(root.variants); let limited = false;
  const details = valid ? root!.variants as JsonValue[] : [];
  if (details.length > Math.max(0, limits.maxVariantDetails)) {limited = true; valid = false;}
  for (const raw of details.slice(0, Math.max(0, limits.maxVariantDetails))) {
    if (!object(raw)) {valid = false; continue;} const id = identity(raw);
    if (!id || variants.has(id)) {valid = false; continue;}
    const price = money(raw.price, false); const compareAt = money(raw.compare_at_price, true);
    if (!price || !compareAt) {valid = false; continue;}
    variants.set(id, {id, title: label(raw.title), sku: label(raw.sku), price, compareAt});
  }
  let expected: Set<string> | undefined;
  if (root && Array.isArray(root.variant_gids)) {
    expected = new Set();
    if (root.variant_gids.length > Math.max(0, limits.maxExpectedVariantIds)) {limited = true; valid = false;}
    for (const raw of root.variant_gids.slice(0, Math.max(0, limits.maxExpectedVariantIds))) {
      const id = expectedIdentity(raw); if (!id || expected.has(id)) valid = false; else expected.add(id);
    }
  }
  const missing = expected ? [...expected].filter((id) => !variants.has(id)).length : undefined;
  const status: PricingCoverageStatus = limited || !valid || !expected ? "UNVERIFIED" : missing ? "PARTIAL" : "COMPLETE";
  return {variants, valid, coverage: {status, detailedVariantCount: variants.size,
    ...(expected ? {expectedVariantCount: expected.size, missingDetailCount: missing} : {}), limited}};
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
    path: `/variants/${change.variantId}/${change.field === "PRICE" ? "price" : "compare_at_price"}`, normalizedPath: `/variants/*/${change.field === "PRICE" ? "price" : "compare_at_price"}`,
    operation: "CHANGED", before: change.before, after: change.after});
  return {structural, signals, findings: deriveCatalogComparisonFindings(resourceType, signals, {truncated: structural.truncated}), pricing};
}
