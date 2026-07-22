import type {CatalogResourceType} from "./catalog-change-taxonomy";
import type {CatalogChangeSignal, CatalogChangeSignalCode} from "./catalog-change-signals";

export const CATALOG_COMPARISON_FINDING_CODES = [
  "PRODUCT_IDENTITY_CHANGED", "PRODUCT_PUBLICATION_CHANGED", "PRODUCT_ORGANIZATION_CHANGED",
  "PRODUCT_OPTIONS_CHANGED", "VARIANT_PRICING_CHANGED", "VARIANT_IDENTIFIERS_CHANGED",
  "PRODUCT_MEDIA_CHANGED", "PRODUCT_IDENTITY_AND_PUBLICATION_CHANGED",
  "PRODUCT_OPTIONS_AND_VARIANTS_CHANGED", "COLLECTION_IDENTITY_CHANGED",
  "COLLECTION_PUBLICATION_CHANGED", "COLLECTION_RULES_CHANGED", "COLLECTION_MEDIA_CHANGED",
  "COLLECTION_RULES_AND_PUBLICATION_CHANGED",
] as const;
export type CatalogComparisonFindingCode = (typeof CATALOG_COMPARISON_FINDING_CODES)[number];
export interface CatalogComparisonFinding {code: CatalogComparisonFindingCode; label: string; evidenceSignalCodes: CatalogChangeSignalCode[]; evidenceCount: number}
export interface CatalogComparisonFindingContext {truncated: boolean}

type Rule = {code: CatalogComparisonFindingCode; label: string; evidence: readonly CatalogChangeSignalCode[]; requires?: readonly (readonly CatalogChangeSignalCode[])[]};
const product: readonly Rule[] = [
  {code:"PRODUCT_IDENTITY_CHANGED",label:"Product identity fields changed",evidence:["PRODUCT_TITLE_CHANGED","PRODUCT_HANDLE_CHANGED"]},
  {code:"PRODUCT_PUBLICATION_CHANGED",label:"Product publication fields changed",evidence:["PRODUCT_STATUS_CHANGED","PRODUCT_PUBLICATION_CHANGED"]},
  {code:"PRODUCT_ORGANIZATION_CHANGED",label:"Product organization fields changed",evidence:["PRODUCT_VENDOR_CHANGED","PRODUCT_TYPE_CHANGED","PRODUCT_TAGS_CHANGED"]},
  {code:"PRODUCT_OPTIONS_CHANGED",label:"Product options changed",evidence:["PRODUCT_OPTIONS_CHANGED"]},
  {code:"VARIANT_PRICING_CHANGED",label:"Variant pricing fields changed",evidence:["VARIANT_PRICE_CHANGED","VARIANT_COMPARE_AT_PRICE_CHANGED"]},
  {code:"VARIANT_IDENTIFIERS_CHANGED",label:"Variant identifier fields changed",evidence:["VARIANT_SKU_CHANGED","VARIANT_BARCODE_CHANGED"]},
  {code:"PRODUCT_MEDIA_CHANGED",label:"Product media changed",evidence:["PRODUCT_MEDIA_CHANGED"]},
  {code:"PRODUCT_IDENTITY_AND_PUBLICATION_CHANGED",label:"Product identity and publication changed in the same comparison",evidence:["PRODUCT_TITLE_CHANGED","PRODUCT_HANDLE_CHANGED","PRODUCT_STATUS_CHANGED","PRODUCT_PUBLICATION_CHANGED"],requires:[["PRODUCT_TITLE_CHANGED","PRODUCT_HANDLE_CHANGED"],["PRODUCT_STATUS_CHANGED","PRODUCT_PUBLICATION_CHANGED"]]},
  {code:"PRODUCT_OPTIONS_AND_VARIANTS_CHANGED",label:"Product options and variant fields changed in the same comparison",evidence:["PRODUCT_OPTIONS_CHANGED","VARIANT_PRICE_CHANGED","VARIANT_COMPARE_AT_PRICE_CHANGED","VARIANT_SKU_CHANGED","VARIANT_BARCODE_CHANGED"],requires:[["PRODUCT_OPTIONS_CHANGED"],["VARIANT_PRICE_CHANGED","VARIANT_COMPARE_AT_PRICE_CHANGED","VARIANT_SKU_CHANGED","VARIANT_BARCODE_CHANGED"]]},
];
const collection: readonly Rule[] = [
  {code:"COLLECTION_IDENTITY_CHANGED",label:"Collection identity fields changed",evidence:["COLLECTION_TITLE_CHANGED","COLLECTION_HANDLE_CHANGED"]},
  {code:"COLLECTION_PUBLICATION_CHANGED",label:"Collection publication fields changed",evidence:["COLLECTION_PUBLICATION_CHANGED"]},
  {code:"COLLECTION_RULES_CHANGED",label:"Collection rules changed",evidence:["COLLECTION_RULES_CHANGED"]},
  {code:"COLLECTION_MEDIA_CHANGED",label:"Collection media changed",evidence:["COLLECTION_MEDIA_CHANGED"]},
  {code:"COLLECTION_RULES_AND_PUBLICATION_CHANGED",label:"Collection rules and publication changed in the same comparison",evidence:["COLLECTION_RULES_CHANGED","COLLECTION_PUBLICATION_CHANGED"],requires:[["COLLECTION_RULES_CHANGED"],["COLLECTION_PUBLICATION_CHANGED"]]},
];

export function deriveCatalogComparisonFindings(resourceType: CatalogResourceType, signals: readonly CatalogChangeSignal[], _context?: CatalogComparisonFindingContext): CatalogComparisonFinding[] {
  const counts = new Map<CatalogChangeSignalCode, number>();
  for (const signal of signals) if (signal && typeof signal === "object") counts.set(signal.code, (counts.get(signal.code) ?? 0) + 1);
  const rules = resourceType === "PRODUCT" ? product : resourceType === "COLLECTION" ? collection : [];
  return rules.flatMap((rule) => {
    const present = rule.evidence.filter((code) => counts.has(code));
    const matches = rule.requires ? rule.requires.every((family) => family.some((code) => counts.has(code))) : present.length > 0;
    return matches ? [{code: rule.code, label: rule.label, evidenceSignalCodes: [...present], evidenceCount: present.reduce((sum, code) => sum + (counts.get(code) ?? 0), 0)}] : [];
  });
}
