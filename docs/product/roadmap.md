# Catalogged Product Roadmap

## Purpose and authority

This document is the canonical and exhaustive product roadmap for Catalogged. It records every repository-proven completed or active SKU, every approved planned SKU, the strategic backlog, dependency and phase ordering, architectural boundaries, and product exclusions. Repository content—not this document alone—proves whether implementation is merged. Legacy technical identifiers may remain until an authorized migration changes them.

## Product thesis

Catalogged is a catalog observability and product-integrity platform. It verifies that products are complete, correct, synchronized, and discoverable, and traces discrepancies from the official catalog to the channel, commerce surface, retailer, marketplace, or AI agent that surfaced them.

The long-term model is **Catalogged Core + Catalog Source Adapters + External Observation Adapters + Platform Shells**. Shopify is the first official Catalog Source Adapter, platform adapter, and distribution shell; the Shopify app is not the whole product.

Development must follow this order without skipping a prerequisite stage:

**Observe → Understand → Detect → Identity → External observation → Lineage → Governance → Recovery planning → Controlled recovery → Optional automation**

The shared foundations for external observability are:

1. **Product Identity Graph:** evidence-backed identities and relations across official and external entities.
2. **External Product Observation:** immutable, timestamped, provider-normalized evidence of an external representation.
3. **Catalog Lineage:** evidence-backed relationships and comparisons across official snapshots, transformations, destinations, sellers, and agents.

Channel Integrity, Commerce Surface Integrity, and Agent Visibility are derived read models or solution experiences over these primitives. Agent Visibility is not a separate persistence architecture.

## Product boundaries

Catalogged is not a PIM, feed manager, catalog editor, ecommerce platform, pricing optimization system, generic AI visibility dashboard, SEO or GEO content tool, generalized automation platform, or guaranteed rollback system. It observes and evaluates evidence before it governs or intervenes. It does not claim complete coverage, causality, or recoverability without proof.

Architectural boundaries are read-only Shopify access through SKU-053; immutable evidence before projections; deterministic and bounded evaluation before AI or automation; explicit shop, provider, seller, market, currency, and query context; no second catalog-source abstraction without a real second adapter; and no provider-specific domain fork where a shared primitive applies.

## Status definitions

- **MERGED:** implementation is present in the authoritative merged branch and supported by repository content.
- **IN_REVIEW:** implementation exists on a review branch or PR but is not proven merged.
- **PLANNED:** approved and sequenced, but not implemented or authorized beyond its stated scope.
- **BLOCKED:** approved conditionally but cannot begin until a named prerequisite or decision is satisfied.
- **STRATEGIC_BACKLOG:** unscheduled exploration with no implementation authorization.
- **REJECTED:** explicitly outside the roadmap, or deferred until the roadmap is deliberately revised.

## Roadmap summary

| Scope | SKUs | State |
| --- | --- | --- |
| Repository-proven merged history | SKU-001–SKU-016 | MERGED |
| Current review slice | SKU-017 | IN_REVIEW |
| Official Catalog Evidence | SKU-018–SKU-021 | PLANNED |
| Catalog Integrity | SKU-022–SKU-027 | PLANNED |
| Product Identity Graph | SKU-028–SKU-032 | PLANNED |
| External Product Observation | SKU-033–SKU-040 | SKU-033–SKU-039 PLANNED; SKU-040 BLOCKED |
| Catalog Lineage | SKU-041–SKU-045 | PLANNED |
| Derived Visibility and Incidents | SKU-046–SKU-050 | PLANNED |
| Intervention and Recovery | SKU-051–SKU-055 | SKU-051–SKU-054 PLANNED; SKU-055 BLOCKED |
| Preventive Control and Automation | SKU-056–SKU-058 | PLANNED |
| Strategic backlog | SKU-B01 | STRATEGIC_BACKLOG |

## Completed and active SKUs

### SKU-001 — Shopify foundation

- **Status:** MERGED
- **Phase:** Observe foundation
- **Repository evidence:** Foundation commits `4a376ec` and `94e5fcf`; React Router Shopify shell, OAuth/session storage, Prisma `Session`, and `read_products` configuration.
- **Objective:** Establish the embedded, authenticated, read-only Shopify application foundation.
- **Delivered capability:** Shopify authentication, session persistence, app shell, toolchain, and quality gate.
- **Architectural decision:** Shopify is the first adapter and shell; SQLite/Prisma stores sessions; access is read-only.
- **Explicit exclusions:** Catalog observation, writes, recovery, automation, and additional providers.
- **Dependencies:** None.
- **Exit result:** The foundation was merged and can host bounded catalog-observation slices.

### SKU-002 — Catalog monitor foundation

- **Status:** MERGED
- **Phase:** Observe
- **Repository evidence:** Commit `ace7b9a`; `CatalogWebhook`, authenticated product webhook routes, canonical JSON hashing, idempotency, and diagnostics.
- **Objective:** Retain authenticated product webhook evidence safely.
- **Delivered capability:** Immutable raw delivery storage and processing state for product events.
- **Architectural decision:** Transport evidence is distinct from product state; webhook ID is the idempotency key.
- **Explicit exclusions:** Snapshots, semantic interpretation, timelines, writes, and automation.
- **Dependencies:** SKU-001.
- **Exit result:** Authenticated product deliveries are retained as canonical evidence.

### SKU-003 — Catalog event coverage

- **Status:** MERGED
- **Phase:** Observe
- **Repository evidence:** Commit `a8e6d43`; collection create/update/delete routes, generalized resource identity, schema migration, and tests.
- **Objective:** Extend observation across supported product and collection lifecycle events.
- **Delivered capability:** Product and collection create, update, and delete coverage.
- **Architectural decision:** One resource-typed ingestion path preserves complete authenticated payloads.
- **Explicit exclusions:** Additional resource types, snapshots, polling, Shopify fetches, and writes.
- **Dependencies:** SKU-002.
- **Exit result:** The supported official event set is ingested consistently and idempotently.

### SKU-004 — Catalog snapshot engine

- **Status:** MERGED
- **Phase:** Observe
- **Repository evidence:** Commit `899c655`; `CatalogSnapshot` model/migration and snapshot projection service/tests.
- **Objective:** Project immutable catalog state evidence from retained webhooks.
- **Delivered capability:** At most one canonical snapshot or tombstone per source webhook.
- **Architectural decision:** Snapshots are immutable projections, not mutable current state; no backfill or Shopify fetch occurs.
- **Explicit exclusions:** Diffing, timelines, normalized variants, reconciliation, and writes.
- **Dependencies:** SKU-003.
- **Exit result:** New supported webhooks deterministically produce bounded snapshot evidence.

### SKU-005 — Catalog activity timeline

- **Status:** MERGED
- **Phase:** Understand
- **Repository evidence:** Commit `6fc9d7c`; catalog and resource-history routes plus bounded timeline service/tests.
- **Objective:** Make snapshot activity inspectable by merchants.
- **Delivered capability:** Shop-scoped, filterable, cursor-paginated timeline and exact resource history.
- **Architectural decision:** The timeline is an on-demand metadata read model over immutable snapshots.
- **Explicit exclusions:** Snapshot-state parsing, field comparison, persisted timeline, policies, and writes.
- **Dependencies:** SKU-004.
- **Exit result:** Merchants can navigate bounded official catalog history.

### SKU-006 — Structural catalog diff

- **Status:** MERGED
- **Phase:** Understand
- **Repository evidence:** Commit `f44b276`; structural diff service, renderer, resource comparison UI, and tests.
- **Objective:** Compare eligible adjacent snapshots structurally.
- **Delivered capability:** Bounded RFC 6901 path-level added, removed, and changed evidence.
- **Architectural decision:** Diffs are calculated on demand; arrays are positional and identity-unaware; truncation is explicit.
- **Explicit exclusions:** Semantic meaning, severity, persistence, recovery, and Shopify writes.
- **Dependencies:** SKU-005.
- **Exit result:** Exact adjacent eligible states can be compared with lifecycle and safety bounds.

### SKU-007 — Catalog change taxonomy

- **Status:** MERGED
- **Phase:** Understand
- **Repository evidence:** Commit `57ef1a3`; deterministic resource-specific path taxonomy and tests.
- **Objective:** Classify returned structural paths into factual catalog categories.
- **Delivered capability:** Allow-listed categories, normalized array-index matching, and ordered summaries.
- **Architectural decision:** Exact paths remain evidence; unknown or malformed paths remain `OTHER`; nothing is persisted.
- **Explicit exclusions:** Importance, risk, anomaly, incidents, AI, and recovery.
- **Dependencies:** SKU-006.
- **Exit result:** Returned structural changes have deterministic descriptive categories.

### SKU-008 — Deterministic catalog change signals

- **Status:** MERGED
- **Phase:** Detect
- **Repository evidence:** Commit `bd926d6`; pure signal derivation and tests integrated into comparison rendering.
- **Objective:** Derive explicit signals from allow-listed structural evidence.
- **Delivered capability:** Fixed signal families with original path, operation, and before/after evidence.
- **Architectural decision:** Signals use only returned diffs and inherit their identity and completeness limits.
- **Explicit exclusions:** Scores, severity, anomaly, policy, alerting, recovery, AI, and persistence.
- **Dependencies:** SKU-007.
- **Exit result:** Eligible changes yield reproducible, evidence-linked signals.

### SKU-009 — Deterministic comparison findings

- **Status:** MERGED
- **Phase:** Detect
- **Repository evidence:** Commit `498ee51`; comparison-finding derivation, UI integration, and tests.
- **Objective:** Summarize factual signal families within one exact comparison.
- **Delivered capability:** Deterministic findings and returned-evidence counts.
- **Architectural decision:** Findings consume signals rather than reinterpreting raw state and are not persisted.
- **Explicit exclusions:** Historical analysis, severity, anomaly, recommendations, incidents, and recovery.
- **Dependencies:** SKU-008.
- **Exit result:** One eligible comparison produces bounded, traceable findings.

### SKU-010 — Bounded historical finding summary

- **Status:** MERGED
- **Phase:** Detect
- **Repository evidence:** Commit `2526b88`; finding-history service, route integration, and tests.
- **Objective:** Summarize recent findings for one exact resource.
- **Delivered capability:** Bounded adjacent-comparison history with lifecycle gates and truncation qualifications.
- **Architectural decision:** Existing diff, signal, and finding primitives are reused on demand without jobs or persistence.
- **Explicit exclusions:** Catalog-wide analysis, trends, thresholds, anomaly, policy, and recovery.
- **Dependencies:** SKU-009.
- **Exit result:** A merchant can inspect factual recent finding counts for a selected resource.

### SKU-011 — Historical finding occurrence drilldown

- **Status:** MERGED
- **Phase:** Detect
- **Repository evidence:** Commit `942402f`; occurrence details and links from history to exact comparisons.
- **Objective:** Trace each historical finding to its exact adjacent comparison.
- **Delivered capability:** Bounded occurrences with evidence count, timestamp, truncation qualification, and comparison link.
- **Architectural decision:** Occurrences are a non-persisted extension of the SKU-010 read model.
- **Explicit exclusions:** Frequency classification, trends, severity, incidents, recommendations, and recovery.
- **Dependencies:** SKU-010.
- **Exit result:** Historical summary claims can be inspected at their source comparison.

### SKU-012 — Bounded catalog finding activity

- **Status:** MERGED
- **Phase:** Detect
- **Repository evidence:** Commit `478f46c` plus pagination fixes `95ee98c` and `434da3f`; catalog-wide activity service/UI/tests.
- **Objective:** Expose recent factual finding occurrences across a shop catalog.
- **Delivered capability:** Shop-scoped bounded candidate pagination with exact predecessor resolution and occurrence links.
- **Architectural decision:** Pagination follows candidates, including skipped and zero-finding comparisons; results are on demand.
- **Explicit exclusions:** Complete catalog claims, trends, severity, incidents, policy, and recovery.
- **Dependencies:** SKU-011.
- **Exit result:** Merchants can browse qualified recent finding activity across supported resources.

### SKU-013 — Catalog detection overview

- **Status:** MERGED
- **Phase:** Detect
- **Repository evidence:** Commit `7c79efa`; dedicated detection-overview service, filters, pagination, UI, and tests.
- **Objective:** Group deterministic finding types in a bounded recent candidate window.
- **Delivered capability:** Counts for comparisons, resources, returned signals, truncation, and latest occurrences.
- **Architectural decision:** A separate bounded read model reuses shared primitives and exposes independent coverage limits.
- **Explicit exclusions:** Catalog-wide completeness, risk, trends, incidents, recommendations, and recovery.
- **Dependencies:** SKU-012.
- **Exit result:** Merchants receive a bounded evidence-qualified detection overview.

### SKU-014 — Deployment and embedded app validation

- **Status:** MERGED
- **Phase:** Official Catalog Evidence foundation
- **Repository evidence:** Commit `9c41e9c`; Render blueprint, health route/test, production start path, and deployment-validation runbook.
- **Objective:** Make deployment readiness and external embedded validation explicit and reproducible.
- **Delivered capability:** Single-instance Render/SQLite configuration, health check, and human validation record.
- **Architectural decision:** Repository checks do not prove external deployment; blocked human checks remain explicit.
- **Explicit exclusions:** Automatic deployment approval, additional infrastructure, write scopes, and recovery.
- **Dependencies:** SKU-013.
- **Exit result:** Deployment configuration is merged; external validation still requires recorded human evidence.

### SKU-015 — Merchant catalog observability experience

- **Status:** MERGED
- **Phase:** Official Catalog Evidence foundation
- **Repository evidence:** Commit `a8ba613` on `origin/main`; merchant overview, catalog navigation, route presentation, and UI tests.
- **Objective:** Organize existing catalog evidence into a clearer merchant experience.
- **Delivered capability:** Redesigned overview, catalog experience, navigation, and evidence presentation.
- **Architectural decision:** Presentation composes existing bounded read models without adding domain persistence.
- **Explicit exclusions:** New detection semantics, policy, external channels, recovery, and writes.
- **Dependencies:** SKU-014.
- **Exit result:** Existing observability capabilities form a coherent merchant-facing workflow.

### SKU-016 — Merchant app visual design and interaction

- **Status:** MERGED
- **Phase:** Official Catalog Evidence foundation
- **Repository evidence:** Commit `1cd6f3a` on `origin/main`; merchant styles and interaction refinements with test updates.
- **Objective:** Elevate visual hierarchy and interaction quality of the merchant app.
- **Delivered capability:** Refined catalog presentation, layout, responsive behavior, and interaction states.
- **Architectural decision:** Visual work remains isolated from evidence and domain semantics.
- **Explicit exclusions:** New product capability, persistence, scope changes, external observations, and writes.
- **Dependencies:** SKU-015.
- **Exit result:** The merged merchant shell presents existing evidence consistently.

### SKU-017 — Identity-aware variant pricing evidence

- **Status:** IN_REVIEW
- **Phase:** Official Catalog Evidence foundation
- **Repository evidence:** Review-branch commits `293bfee` and `bab0017`; identity-aware comparison analysis, bounded decimal handling, coverage qualification, UI, and tests. Neither commit is contained in `origin/main`.
- **Objective:** Compare variant price and compare-at evidence by stable Shopify identity.
- **Delivered capability:** Proposed matching by GraphQL variant ID with constrained fallback, exact decimal canonicalization, and `COMPLETE`/`PARTIAL`/`UNVERIFIED` coverage.
- **Architectural decision:** Identity, never array position or label, controls pricing comparison; analysis remains bounded, on demand, and non-persisted.
- **Explicit exclusions:** Merchant-wide pricing read model, alerts, policy, external identity, Shopify fetching, writes, and recovery.
- **Dependencies:** SKU-016.
- **Exit result:** Pending review and merge; repository evidence does not yet prove a merged result.

## Phase 1 — Official Catalog Evidence

### SKU-018 — Catalogged product identity migration

**Status:** PLANNED
**Phase:** Phase 1 — Official Catalog Evidence
**Depends on:** SKU-017

#### Objective

Migrate visible product identity from Skuard to Catalogged without changing functional behavior.

#### Includes

Merchant-facing product name, metadata, documentation, navigation labels, available brand assets, and an inventory of legacy technical identifiers.

#### Excludes

Indiscriminate environment-variable renaming, destructive database changes, functional product work, scope changes, and broad architectural refactoring.

#### Architectural decisions

Preserve legacy technical identifiers where migration risk exceeds visible-brand benefit; make no persistence, identity-model, or provider behavior change.

#### Exit criteria

All visible supported surfaces say Catalogged, the legacy-identifier inventory is recorded, and behavior, scopes, tests, and schema remain unchanged.

#### Promotion rule

SKU-019 may begin only after the visible identity audit and regression validation pass.

### SKU-019 — Merchant price change observability

**Status:** PLANNED
**Phase:** Phase 1 — Official Catalog Evidence
**Depends on:** SKU-017; SKU-018

#### Objective

Expose identity-aware price and compare-at evidence as a merchant-facing, bounded read model.

#### Includes

Recent pricing activity, before and after values, variant identity, transition, timestamp, coverage, allow-listed filters, exact resource-history links, and complete, partial, or unverified qualifications.

#### Excludes

Policies, alerts, incidents, attribution inference, recovery, and external channels.

#### Architectural decisions

Calculate a shop-isolated read model from immutable official evidence; do not add mutable pricing state or hide incomplete coverage.

#### Exit criteria

Merchants can retrieve bounded, filter-safe pricing activity and trace every result to qualified source evidence.

#### Promotion rule

SKU-020 begins only after identity correctness, pagination bounds, and coverage language are validated.

### SKU-020 — Variant-level catalog history

**Status:** PLANNED
**Phase:** Phase 1 — Official Catalog Evidence
**Depends on:** SKU-019

#### Objective

Provide bounded history around one stable variant identity.

#### Includes

Price, compare-at price, lifecycle, availability only when evidence supports it, chronological history, pagination, and coverage.

#### Excludes

A global variant projection, mutable current-state table, and external identity matching.

#### Architectural decisions

Resolve one stable official identity against immutable snapshots; preserve shop isolation, time ordering, and explicit evidence gaps.

#### Exit criteria

One exact variant has deterministic paginated history with lifecycle and coverage qualifications.

#### Promotion rule

SKU-021 begins only after stable identity and history ordering remain correct across lifecycle boundaries.

### SKU-021 — Bounded catalog evidence export

**Status:** PLANNED
**Phase:** Phase 1 — Official Catalog Evidence
**Depends on:** SKU-019; SKU-020

#### Objective

Export selected catalog evidence safely.

#### Includes

Bounded CSV, allow-listed fields, formula-injection protection, timestamp, resource identity, coverage, and active-filter semantics.

#### Excludes

Raw webhooks, raw snapshots, unbounded exports, scheduled reports, and external warehouse integration.

#### Architectural decisions

Export the same bounded shop-scoped read models shown to the merchant; stream safely and preserve filters and qualifications.

#### Exit criteria

Exports enforce row and field limits, neutralize spreadsheet formulas, and reproduce visible filter and coverage semantics.

#### Promotion rule

Phase 2 begins only after official evidence is safely inspectable, traceable, and exportable.

## Phase 2 — Catalog Integrity

### SKU-022 — Deterministic integrity evaluation primitive

**Status:** PLANNED
**Phase:** Phase 2 — Catalog Integrity
**Depends on:** SKU-021

#### Objective

Create the pure, deterministic primitive for evaluating catalog integrity from official evidence.

#### Includes

Typed inputs, stable check identifiers, factual outcomes, evidence references, coverage, limits, and deterministic ordering.

#### Excludes

Merchant policies, persistence, alerts, external observations, AI judgment, and actions.

#### Architectural decisions

Keep evaluation pure and provider-neutral at the core, with Shopify evidence adapted at the boundary; fail closed on invalid or incomplete input.

#### Exit criteria

Repeated evaluation of identical evidence produces identical bounded results with explicit coverage.

#### Promotion rule

Check-family SKUs begin only after the primitive contract and failure semantics are tested.

### SKU-023 — Pricing integrity checks

**Status:** PLANNED
**Phase:** Phase 2 — Catalog Integrity
**Depends on:** SKU-022

#### Objective

Detect deterministic pricing integrity conditions in official catalog evidence.

#### Includes

Missing price, zero price, invalid compare-at relationship, threshold-based price changes, and bounded high-volume price changes.

#### Excludes

Cost or negative-margin checks without reliable cost evidence, optimization, elasticity, alerts, and actions.

#### Architectural decisions

Use exact decimal semantics, explicit thresholds, stable variant identity, and qualified evidence coverage.

#### Exit criteria

Each supported pricing condition has deterministic fixtures, evidence, bounds, and false-positive controls.

#### Promotion rule

SKU-024 may begin after pricing checks prove the shared evaluation contract on real snapshot shapes.

### SKU-024 — Variant integrity checks

**Status:** PLANNED
**Phase:** Phase 2 — Catalog Integrity
**Depends on:** SKU-022; SKU-023

#### Objective

Detect deterministic ambiguity and identity problems in official variants.

#### Includes

Duplicated option combinations, ambiguous labels, inconsistent size or unit representation, ambiguous packs, and invalid or missing stable identity.

#### Excludes

Probabilistic matching, automatic normalization, catalog edits, and external identities.

#### Architectural decisions

Checks operate on recorded structured values and explicit normalization rules; uncertainty remains visible.

#### Exit criteria

Supported variant conditions produce reproducible, identity-linked evidence without arbitrary correction.

#### Promotion rule

SKU-025 may begin after variant normalization rules and ambiguity handling are validated.

### SKU-025 — Product content integrity checks

**Status:** PLANNED
**Phase:** Phase 2 — Catalog Integrity
**Depends on:** SKU-022; SKU-024

#### Objective

Detect deterministic completeness and contradiction conditions in official product content.

#### Includes

Missing category, missing primary image, absent required attributes, critical data present only in free text, and explicit contradictions.

#### Excludes

AI-generated judgment, content generation, quality scoring, SEO/GEO advice, and edits.

#### Architectural decisions

Use allow-listed structured rules and literal contradictions; provider extraction is isolated from the pure evaluator.

#### Exit criteria

Every check explains the required evidence, returns bounded results, and avoids subjective content claims.

#### Promotion rule

SKU-026 begins after all three check families expose one stable result contract.

### SKU-026 — Integrity findings experience

**Status:** PLANNED
**Phase:** Phase 2 — Catalog Integrity
**Depends on:** SKU-023; SKU-024; SKU-025

#### Objective

Expose deterministic integrity findings with evidence and coverage.

#### Includes

Bounded lists, check family, affected identity, factual evidence, severity supplied by fixed defaults, filters, coverage, and source-history links.

#### Excludes

Incidents, alerts, recommendations, policy editing, external channels, and actions.

#### Architectural decisions

Build a shop-isolated derived read model over evaluation outputs; do not create mutable issue truth.

#### Exit criteria

Merchants can filter, inspect, and trace every integrity finding without completeness overclaiming.

#### Promotion rule

SKU-027 begins after evidence traceability and merchant comprehension are validated.

### SKU-027 — Integrity policies

**Status:** PLANNED
**Phase:** Phase 2 — Catalog Integrity
**Depends on:** SKU-026

#### Objective

Allow merchants to configure deterministic checks and thresholds.

#### Includes

Enabled checks, thresholds, protected resources, maintenance windows, severities, and allow-lists where evidence supports them.

#### Excludes

Automatic actions, recovery, AI policies, arbitrary code, and external-channel rules.

#### Architectural decisions

Persist versioned, shop-isolated policy configuration separately from immutable evidence and deterministic evaluation.

#### Exit criteria

Policy changes are validated, auditable, bounded, and reproducibly alter only authorized checks.

#### Promotion rule

Identity work begins only after official integrity outcomes remain deterministic under versioned policy.

## Phase 3 — Product Identity Graph

### SKU-028 — External identity domain model

**Status:** PLANNED
**Phase:** Phase 3 — Product Identity Graph
**Depends on:** SKU-027

#### Objective

Define external product, variant, offer, seller, market, and representation identities without assuming a one-to-one Shopify mapping.

#### Includes

Entity types, scoped identifiers, provenance, validity, market and seller context, and cardinality rules.

#### Excludes

Resolution, connectors, observations, probabilistic identity, and merchant editing.

#### Architectural decisions

Keep the domain provider-neutral; official Shopify identity is one namespace, not the universal key.

#### Exit criteria

The model represents one-to-many and many-to-one external relationships without losing provenance.

#### Promotion rule

SKU-029 begins after representative identity cases and isolation boundaries fit the model.

### SKU-029 — Deterministic external identity keys

**Status:** PLANNED
**Phase:** Phase 3 — Product Identity Graph
**Depends on:** SKU-028

#### Objective

Produce deterministic comparable keys for official and external identities.

#### Includes

Normalizers for provider ID, SKU, GTIN, MPN and brand, canonical URL, variant option tuple, seller, and market.

#### Excludes

Fuzzy text matching, embeddings, LLM inference, and arbitrary winner selection.

#### Architectural decisions

Version pure normalizers, retain raw values, scope keys by provider/context, and reject invalid values explicitly.

#### Exit criteria

Every key type has deterministic normalization, collision tests, provenance, and invalid-input behavior.

#### Promotion rule

SKU-030 begins only after key collision and context-loss risks are measured and bounded.

### SKU-030 — Product identity relation model

**Status:** PLANNED
**Phase:** Phase 3 — Product Identity Graph
**Depends on:** SKU-028; SKU-029

#### Objective

Represent evidence-backed relations between official and external entities.

#### Includes

Relation type, endpoints, evidence, method, context, validity interval, status, and ambiguity.

#### Excludes

Observations, lineage conclusions, manual bulk editing, and probabilistic scores.

#### Architectural decisions

Persist relations as auditable graph edges; never overwrite conflicting evidence or imply one-to-one cardinality.

#### Exit criteria

Relations preserve source evidence and can express confirmed, ambiguous, invalid, and superseded states.

#### Promotion rule

SKU-031 begins after relation constraints and temporal semantics are validated.

### SKU-031 — Bounded identity resolution service

**Status:** PLANNED
**Phase:** Phase 3 — Product Identity Graph
**Depends on:** SKU-029; SKU-030

#### Objective

Resolve external identity candidates deterministically and without arbitrary winners.

#### Includes

`MATCHED`, `AMBIGUOUS`, `UNMATCHED`, `INVALID`, and `UNVERIFIED` outputs with method, evidence, candidates, and bounds.

#### Excludes

Probabilistic matching, embeddings, LLM resolution, hidden tie-breaking, and catalog mutation.

#### Architectural decisions

Use ordered evidence rules over bounded candidates; ambiguity and insufficient coverage are first-class results.

#### Exit criteria

Resolution is reproducible, context-scoped, evidence-linked, and never selects an unsupported winner.

#### Promotion rule

SKU-032 begins after ambiguity, invalid input, and bounded-search behavior pass adversarial tests.

### SKU-032 — Identity inspection experience

**Status:** PLANNED
**Phase:** Phase 3 — Product Identity Graph
**Depends on:** SKU-031

#### Objective

Inspect matches, ambiguity, missing identities, methods, evidence, and coverage.

#### Includes

Entity context, relation status, candidates, resolution method, raw and normalized keys, evidence, and coverage.

#### Excludes

Probabilistic matching, embeddings, LLM resolution, bulk identity editing, and connector execution.

#### Architectural decisions

Expose a bounded read model over the shared Product Identity Graph; do not create presentation-specific identity truth.

#### Exit criteria

Users can audit every resolution outcome and distinguish missing evidence from mismatch.

#### Promotion rule

External observation begins only after identity outcomes are inspectable and reliable enough for provider evidence.

## Phase 4 — External Product Observation

### SKU-033 — External Product Observation domain model

**Status:** PLANNED
**Phase:** Phase 4 — External Product Observation
**Depends on:** SKU-032

#### Objective

Define the immutable, timestamped evidence primitive for external product representations.

#### Includes

Provider, retrieval context, entity references, observed fields, raw provenance reference, timestamps, freshness, coverage, and methodology version.

#### Excludes

Provider execution, identity resolution, lineage, findings, incidents, and actions.

#### Architectural decisions

One shared provider-neutral observation envelope owns persistence semantics; provider fields remain isolated payload evidence.

#### Exit criteria

The model represents structured destinations, sellers, commerce surfaces, and agent observations without parallel architectures.

#### Promotion rule

SKU-034 begins after privacy, retention, boundedness, and context requirements are explicit.

### SKU-034 — Provider observation adapter contract

**Status:** PLANNED
**Phase:** Phase 4 — External Product Observation
**Depends on:** SKU-033

#### Objective

Normalize provider-specific observations without creating a separate domain architecture for every channel.

#### Includes

Capability declaration, request context, normalized output, raw evidence reference, errors, rate limits, coverage, and methodology version.

#### Excludes

A connector implementation, writes, generalized scraping, identity graph duplication, and incident logic.

#### Architectural decisions

Adapters translate at the boundary into External Product Observation and expose unsupported capabilities explicitly.

#### Exit criteria

Contract tests prove deterministic normalization, error isolation, bounds, and no provider leakage into the core model.

#### Promotion rule

Provider selection begins only after feasibility evidence can be compared against one stable contract.

### SKU-035 — First structured destination feasibility and selection

**Status:** PLANNED
**Phase:** Phase 4 — External Product Observation
**Depends on:** SKU-034

#### Objective

Evaluate and select the first structured destination.

#### Includes

API availability, evidence quality, access, rate limits, cost, terms, reproducibility, and a documented selection decision.

#### Excludes

Assuming Google Merchant Center, production connector code, unsupported scraping, and writes.

#### Architectural decisions

Selection evidence must fit the shared adapter contract and identify legal, tenant-isolation, retention, and cost constraints.

#### Exit criteria

One destination is selected with verified access and reproducibility, or the SKU records a no-selection result and blocks SKU-036.

#### Promotion rule

SKU-036 begins only with a documented viable provider, credentials model, terms review, and bounded observation method.

### SKU-036 — First structured destination connector

**Status:** PLANNED
**Phase:** Phase 4 — External Product Observation
**Depends on:** SKU-035

#### Objective

Implement one read-only connector selected by SKU-035.

#### Includes

Authentication, bounded retrieval, rate-limit handling, provider normalization, sanitized diagnostics, and contract tests.

#### Excludes

Writes, additional destinations, lineage, incidents, broad framework extraction, and unsupported fields.

#### Architectural decisions

Keep provider code behind the adapter boundary; credentials and data are tenant-isolated and least-privilege.

#### Exit criteria

The connector reproducibly emits bounded normalized observations and handles partial/error states safely.

#### Promotion rule

SKU-037 begins after live-provider evidence validates the contract and operational limits.

### SKU-037 — External observation persistence and idempotency

**Status:** PLANNED
**Phase:** Phase 4 — External Product Observation
**Depends on:** SKU-033; SKU-036

#### Objective

Persist immutable, bounded external observations safely.

#### Includes

Idempotency keys, tenant isolation, provenance, retrieval context, retention, uniqueness rules, failure state, and indexes.

#### Excludes

Mutable external current state, lineage, findings, incidents, provider writes, and unbounded raw retention.

#### Architectural decisions

Observations are append-only evidence; provider delivery identity plus normalized context controls deduplication.

#### Exit criteria

Retries do not duplicate evidence, cross-tenant access is impossible, and retention and query bounds are enforced.

#### Promotion rule

SKU-038 begins after persistence integrity and retry behavior pass operational tests.

### SKU-038 — External observation timeline

**Status:** PLANNED
**Phase:** Phase 4 — External Product Observation
**Depends on:** SKU-037

#### Objective

Show observed external state over time without yet deriving lineage or incidents.

#### Includes

Provider/context filters, observed identity, values, timestamps, freshness, coverage, pagination, and evidence links.

#### Excludes

Official comparison, divergence, causality, incidents, visibility scores, and actions.

#### Architectural decisions

Use a bounded derived read model over immutable observations and shared identity references.

#### Exit criteria

Users can inspect provider observations chronologically with complete context and coverage qualification.

#### Promotion rule

Lineage work may begin only after external evidence is persisted and inspectable; agent work separately requires SKU-039.

### SKU-039 — Agent observation feasibility spike

**Status:** PLANNED
**Phase:** Phase 4 — External Product Observation
**Depends on:** SKU-034; SKU-038

#### Objective

Evaluate legal, technical, methodological, and cost constraints for AI-agent observations.

#### Includes

Terms and access review, reproducibility tests, query/context capture, cost and rate limits, evidence quality, and a `GO`, `CONSTRAINED_GO`, or `NO_GO` decision.

#### Excludes

Production adapter code, generalized scraping, visibility scores, causal claims, and fabricated reproducibility.

#### Architectural decisions

Any viable method must emit the shared External Product Observation primitive with versioned methodology and bounded query context.

#### Exit criteria

The decision and constraints are documented with repeatable evidence and explicit legal/technical review.

#### Promotion rule

SKU-040 is promoted to PLANNED only if the result is `GO` or `CONSTRAINED_GO` and all constraints are accepted.

### SKU-040 — First agent observation adapter

**Status:** BLOCKED
**Phase:** Phase 4 — External Product Observation
**Depends on:** SKU-039 (`GO` or `CONSTRAINED_GO`)

#### Objective

Create External Product Observations from one approved AI-agent surface.

#### Includes

One approved agent, bounded versioned query set, market and session context, response evidence, normalized observations, coverage, and cost controls.

#### Excludes

Generalized scraping, fabricated reproducibility, visibility scores, causal claims, additional agents, and provider writes.

#### Architectural decisions

Agent evidence uses the shared adapter contract and observation persistence; it creates no separate persistence architecture.

#### Exit criteria

One approved surface produces reproducible, context-complete, bounded observations within accepted terms and cost.

#### Promotion rule

The SKU leaves BLOCKED only on SKU-039 `GO` or `CONSTRAINED_GO`; lineage may consume agent evidence only after this exit criteria passes.

## Phase 5 — Catalog Lineage

### SKU-041 — Catalog Lineage domain model

**Status:** PLANNED
**Phase:** Phase 5 — Catalog Lineage
**Depends on:** SKU-032; SKU-038

#### Objective

Relate official snapshots, intermediate observations, destinations, sellers, and agent observations.

#### Includes

Nodes, evidenced edges, contexts, timestamps, transformation layers, provenance, uncertainty, and coverage.

#### Excludes

Divergence conclusions, incidents, causal inference, recovery, and provider-specific parallel lineage models.

#### Architectural decisions

Lineage references the shared identity graph and immutable observations; edges require evidence and temporal context.

#### Exit criteria

Representative chains preserve identity, market, seller, time, provenance, and missing-layer states.

#### Promotion rule

SKU-042 begins after chains can represent incomplete and ambiguous evidence without inventing links.

### SKU-042 — Official-to-external state comparison

**Status:** PLANNED
**Phase:** Phase 5 — Catalog Lineage
**Depends on:** SKU-041

#### Objective

Compare official and external product state factually.

#### Includes

Identity, price, compare-at price, availability, title, selected variant, seller, and URL; outputs `MATCH`, `DIVERGED`, `NOT_OBSERVED`, `AMBIGUOUS`, and `UNVERIFIED`.

#### Excludes

Causality, severity, incidents, recommendations, and unsupported dimension inference.

#### Architectural decisions

Use dimension-specific deterministic comparison with aligned time/context and explicit identity and coverage gates.

#### Exit criteria

Every output is reproducible, dimension-scoped, evidence-linked, and distinguishes absence from divergence.

#### Promotion rule

SKU-043 begins after temporal alignment and ambiguity behavior are validated against observed provider data.

### SKU-043 — First evidenced divergence localization

**Status:** PLANNED
**Phase:** Phase 5 — Catalog Lineage
**Depends on:** SKU-042

#### Objective

Locate the first layer where a difference can be demonstrated.

#### Includes

`SOURCE_DIVERGENCE`, `TRANSFORMATION_DIVERGENCE`, `DESTINATION_DIVERGENCE`, `AGENT_REPRESENTATION_DIVERGENCE`, `UNRESOLVED`, and `INSUFFICIENT_EVIDENCE` classifications.

#### Excludes

Root-cause claims, inferred missing layers, blame, recommendations, and recovery.

#### Architectural decisions

Walk only evidenced lineage edges in temporal order; stop at ambiguity or missing evidence.

#### Exit criteria

Localization identifies the earliest demonstrated difference or explicitly returns unresolved/insufficient evidence.

#### Promotion rule

SKU-044 begins after classification language cannot be mistaken for causal attribution.

### SKU-044 — Catalog lineage investigation experience

**Status:** PLANNED
**Phase:** Phase 5 — Catalog Lineage
**Depends on:** SKU-043

#### Objective

Render a factual product-state chain with timestamps, values, evidence, and coverage.

#### Includes

Official and external layers, identity relation, context, dimension comparisons, first evidenced divergence, gaps, freshness, and source links.

#### Excludes

Incidents, recommendations, writes, causal narratives, and complete-chain claims when layers are absent.

#### Architectural decisions

The experience is a bounded read model over shared identity, observation, and lineage primitives.

#### Exit criteria

An investigator can trace each displayed value and classification to evidence and see every material gap.

#### Promotion rule

SKU-045 begins after merchants can correctly distinguish divergence, non-observation, and insufficient evidence.

### SKU-045 — Price and availability lineage

**Status:** PLANNED
**Phase:** Phase 5 — Catalog Lineage
**Depends on:** SKU-044

#### Objective

Deliver the first commercially focused lineage view.

#### Includes

Official price, transformed price where observed, destination price, seller price, AI-mentioned price where available, official and observed availability, freshness, and first evidenced divergence.

#### Excludes

Optimization, elasticity, revenue impact, causal attribution, incidents, and recovery.

#### Architectural decisions

Use exact money/currency and availability semantics per context; absent layers remain not observed, never inferred.

#### Exit criteria

Price and availability chains are identity-aligned, context-complete, time-qualified, and auditable.

#### Promotion rule

Derived visibility begins only after the shared primitives support validated commercial lineage.

## Phase 6 — Derived Visibility and Incidents

### SKU-046 — Agent Visibility read model

**Status:** PLANNED
**Phase:** Phase 6 — Derived Visibility and Incidents
**Depends on:** SKU-032; SKU-038; SKU-040; SKU-045

#### Objective

Measure bounded agent visibility from identity, query context, and external observations.

#### Includes

Visibility, position, recommendation share, competitor presence, mentioned-price accuracy, destination distribution, and for every metric its denominator, query set, period, agents, market, coverage, and methodology version.

#### Excludes

Separate persistence architecture, causal claims, generalized GEO scoring, content generation, and guaranteed completeness.

#### Architectural decisions

Agent Visibility is a versioned derived read model over shared identity and External Product Observation primitives.

#### Exit criteria

Every metric is reproducible from retained evidence and displays all denominator, context, coverage, and methodology fields.

#### Promotion rule

SKU-047 begins after metric reproducibility and merchant interpretation are validated.

### SKU-047 — Attribute interpretation read model

**Status:** PLANNED
**Phase:** Phase 6 — Derived Visibility and Incidents
**Depends on:** SKU-045; SKU-046

#### Objective

Compare official structured attributes with attributes observed in external comparisons.

#### Includes

Attribute identity, official value, observed value, context, evidence, agreement state, coverage, and methodology version.

#### Excludes

Claims that an attribute caused inclusion or exclusion, AI content advice, edits, and unsupported semantic inference.

#### Architectural decisions

Derive comparisons from shared observations and lineage; keep extraction method and uncertainty explicit.

#### Exit criteria

Attribute comparisons are evidence-linked and cannot be presented as causal explanations.

#### Promotion rule

SKU-048 begins after attribute extraction and uncertainty are reliable enough for factual operations.

### SKU-048 — Operational divergence findings

**Status:** PLANNED
**Phase:** Phase 6 — Derived Visibility and Incidents
**Depends on:** SKU-045; SKU-047

#### Objective

Derive actionable factual findings from evidenced external divergence.

#### Includes

Stale external price, stale availability, wrong seller, missing variant, variant confusion, pack confusion, and missing destination attribute.

#### Excludes

Incidents, causal attribution, automatic actions, unsupported freshness assumptions, and optimization.

#### Architectural decisions

Findings are deterministic bounded read-model outputs with identity, context, lineage, evidence, and coverage gates.

#### Exit criteria

Each finding type has deterministic criteria, traceable evidence, explicit freshness, and false-positive controls.

#### Promotion rule

SKU-049 begins after findings remain stable across known legitimate contextual differences.

### SKU-049 — Catalog change to external observation correlation

**Status:** PLANNED
**Phase:** Phase 6 — Derived Visibility and Incidents
**Depends on:** SKU-045; SKU-048

#### Objective

Relate official changes to later external changes.

#### Includes

Time-windowed `preceded`, `followed`, `coincided`, and `correlated` relationships with evidence, context, coverage, and methodology.

#### Excludes

Claims that a change caused, resulted in, or was responsible for an external outcome without proof.

#### Architectural decisions

Persist or derive versioned correlation facts separately from lineage; temporal association never upgrades to causality automatically.

#### Exit criteria

Every relationship has explicit windows, denominators, evidence, uncertainty, and non-causal language.

#### Promotion rule

SKU-050 begins after correlation language and methodology pass product and analytical review.

### SKU-050 — Catalog incident management

**Status:** PLANNED
**Phase:** Phase 6 — Derived Visibility and Incidents
**Depends on:** SKU-048; SKU-049

#### Objective

Manage human response to related integrity and divergence findings.

#### Includes

Grouping, evidence, assignment, comments, status, resolution, and reporting.

#### Excludes

Complex workflow automation, automatic remediation, provider writes, causal conclusions, and recovery execution.

#### Architectural decisions

Persist incident workflow separately from immutable evidence and derived findings; references remain auditable and tenant-isolated.

#### Exit criteria

Users can group, own, discuss, resolve, and report incidents without mutating source evidence.

#### Promotion rule

Intervention work begins only after incidents preserve an auditable evidence chain and bounded workflow.

## Phase 7 — Intervention and Recovery

### SKU-051 — Intervention recommendation model

**Status:** PLANNED
**Phase:** Phase 7 — Intervention and Recovery
**Depends on:** SKU-043; SKU-050

#### Objective

Recommend the layer where a correction should occur.

#### Includes

Official catalog, PIM, ERP, feed manager, destination, retailer, marketplace, or seller-listing layer; evidence, rationale, uncertainty, and constraints.

#### Excludes

Execution, guaranteed correction, causal invention, optimization, and unsupported systems.

#### Architectural decisions

Recommendations derive from first evidenced divergence and known ownership; unresolved lineage produces no arbitrary layer.

#### Exit criteria

Every recommendation identifies its evidence and limitations or returns insufficient evidence.

#### Promotion rule

SKU-052 begins after recommended layers are validated with operators and do not overstate causality.

### SKU-052 — Intervention experiment workflow

**Status:** PLANNED
**Phase:** Phase 7 — Intervention and Recovery
**Depends on:** SKU-051

#### Objective

Evaluate a bounded human intervention against later observations.

#### Includes

Baseline, hypothesis, intervention, propagation window, re-observation, outcome, and attribution limitations.

#### Excludes

Automatic execution, guaranteed attribution, broad experimentation platform, and Shopify writes.

#### Architectural decisions

Persist an auditable experiment record referencing immutable evidence; outcomes use versioned observation and correlation methods.

#### Exit criteria

An intervention can be evaluated with pre/post evidence and explicit attribution limits.

#### Promotion rule

SKU-053 begins after experiment records prove that proposed state and verification can be expressed safely.

### SKU-053 — Recovery planning

**Status:** PLANNED
**Phase:** Phase 7 — Intervention and Recovery
**Depends on:** SKU-050; SKU-052

#### Objective

Plan recovery without executing writes.

#### Includes

Target recorded state, affected resources, proposed operations, conflicts, risks, preview, approval, and verification plan.

#### Excludes

Any write, guaranteed rollback, automatic approval, unbounded resources, and unsupported target reconstruction.

#### Architectural decisions

Plans are immutable/versioned read-only artifacts with explicit preconditions and evidence references; approval does not execute.

#### Exit criteria

Users can review a bounded plan, conflicts, risks, and verification steps without any provider mutation.

#### Promotion rule

SKU-054 requires separate explicit implementation authorization plus security, scope, and recovery-plan review.

### SKU-054 — Controlled Shopify recovery

**Status:** PLANNED
**Phase:** Phase 7 — Intervention and Recovery
**Depends on:** SKU-053; separate explicit authorization

#### Objective

Execute the first bounded, approved Shopify correction safely.

#### Includes

Minimal write scopes, precondition checks, idempotency, approval, bounded execution, partial-failure handling, audit trail, and post-write verification.

#### Excludes

Guaranteed rollback, broad catalog editing, unattended automation, bulk unbounded writes, and downstream providers.

#### Architectural decisions

Write capability is isolated behind explicit authorization and least privilege; plans, approvals, operations, and verification are durable and auditable.

#### Exit criteria

One bounded operation handles retries and partial failures safely and verifies the recorded outcome without claiming guaranteed rollback.

#### Promotion rule

No implementation begins without separate authorization; SKU-055 remains blocked until safe Shopify recovery is proven and a downstream provider qualifies.

### SKU-055 — Controlled downstream recovery

**Status:** BLOCKED
**Phase:** Phase 7 — Intervention and Recovery
**Depends on:** SKU-054; a provider with safe, verifiable write and authorization semantics

#### Objective

Correct one approved downstream representation safely when provider semantics permit it.

#### Includes

One qualified provider, least privilege, preconditions, approval, idempotency, bounded execution, audit, partial-failure handling, and verification.

#### Excludes

Generalized feed management, unsupported providers, broad editing, unattended automation, and guaranteed rollback.

#### Architectural decisions

Reuse recovery-plan and audit primitives while isolating provider writes behind its adapter and authorization model.

#### Exit criteria

One provider correction is bounded, authorized, idempotent, audited, and externally verified.

#### Promotion rule

Promote to PLANNED only after SKU-054 maturity and documented provider API, authorization, terms, and verification feasibility.

## Phase 8 — Preventive Control and Automation

### SKU-056 — Pre-deployment catalog validation

**Status:** PLANNED
**Phase:** Phase 8 — Preventive Control and Automation
**Depends on:** SKU-027; SKU-053

#### Objective

Validate a proposed change set before publication.

#### Includes

Bounded proposed state, deterministic integrity evaluation, affected identities, policy results, evidence preview, coverage, and pass/fail explanation.

#### Excludes

Publication, mutation, approval workflow, AI judgment, and guarantees about unobserved downstream effects.

#### Architectural decisions

Run the same versioned pure integrity primitives against an isolated proposal; never persist proposal data as official evidence.

#### Exit criteria

Identical proposals and policy versions produce identical bounded validation with explicit limitations.

#### Promotion rule

SKU-057 begins after proposal isolation and parity with post-publication evaluation are demonstrated.

### SKU-057 — Catalog change approval policies

**Status:** PLANNED
**Phase:** Phase 8 — Preventive Control and Automation
**Depends on:** SKU-027; SKU-056

#### Objective

Require approval based on deterministic scope and impact rules.

#### Includes

Versioned approval rules, protected resources, deterministic impact, approvers, decisions, expiry, and audit trail.

#### Excludes

Arbitrary workflow engines, automatic remediation, content judgment, and bypass of provider authorization.

#### Architectural decisions

Approval state is separate from policies, evidence, and execution; rules are bounded and deterministic.

#### Exit criteria

Protected changes cannot proceed through the controlled path without a valid audited approval.

#### Promotion rule

SKU-058 begins only after approval, recovery, and verification controls withstand failure and bypass testing.

### SKU-058 — Low-risk automatic remediation

**Status:** PLANNED
**Phase:** Phase 8 — Preventive Control and Automation
**Depends on:** SKU-054; SKU-057

#### Objective

Allow only deterministic, bounded, reversible, and post-verified automatic actions.

#### Includes

Mature evidence, mature recovery, auditability, circuit breakers, explicit authorization, narrow allow-listed actions, limits, and post-verification.

#### Excludes

General automation, non-deterministic actions, irreversible or unverified changes, broad writes, and guaranteed rollback.

#### Architectural decisions

Automation invokes existing controlled-recovery primitives; default deny, per-action authorization, circuit breakers, and immediate stop are mandatory.

#### Exit criteria

One low-risk action is demonstrably bounded, reversible, authorized, audited, circuit-broken, and post-verified under failure tests.

#### Promotion rule

Any additional automatic action requires its own explicit evidence, risk review, authorization, and roadmap SKU.

## Strategic Backlog

Backlog SKUs are unscheduled and provide no implementation authorization.

### SKU-B01 — Commerce Surface Integrity

**Status:** STRATEGIC_BACKLOG
**Phase:** Strategic Backlog
**Depends on:** SKU-032; SKU-038; SKU-044; SKU-045; validated customer pain; legally and technically viable observation methods
**Implementation authorization:** None

#### Goal

Detect discrepancies between representations of the same product across ads, shopping channels, PDP, cart, checkout, marketplaces, retailers, and AI agents.

#### Questions

- Does every surface represent the same product?
- Is the observed price consistent with the expected context?
- Is the variant identical?
- Is the pack or size correct?
- Is the seller expected?
- Is the difference legitimate?
- Where is the first evidenced divergence?

#### Architecture

Must reuse Product Identity Graph, External Product Observation, and Catalog Lineage. It may introduce a specialized observation context named **Commerce Surface Observation**, which is a specialization of External Product Observation, not a parallel architecture.

#### Initial wedge

Anonymous-session price and variant consistency between ad, PDP, and cart for one Shopify store, one market, and one currency.

#### Initial exclusions

Checkout automation, real purchases, payment methods, authenticated pricing, B2B pricing, personalized discounts, multiple markets, multiple currencies, Shopify writes, rollback, and unsupported scraping.

#### Exit criteria

There is no implementation exit while this SKU remains in backlog; a promoted slice must define bounded evidence, context, identity, and compliance criteria.

#### Promotion criteria

Promote to PLANNED only when recurring merchant pain is validated; investigation cost is material; a buyer and budget exist; context can be captured reliably; legitimate differences can be distinguished from errors; observation methods comply with platform terms; and identity matching is sufficiently reliable.

## Rejected or deferred directions

The following directions are **REJECTED** from the approved roadmap unless a future governance decision supplies new evidence, boundaries, and an exact SKU: generic feed management; general catalog editing; an AI-generated content platform; a generalized GEO dashboard; competitor price optimization; price elasticity; revenue forecasting; PIM replacement; early multi-platform abstraction without a second real adapter; guaranteed AI-agent causal attribution; and guaranteed rollback.

## Roadmap governance rules

1. Repository content determines what is actually merged.
2. A roadmap status does not replace implementation validation.
3. Every development task starts by reading this roadmap.
4. Every slice is implemented as a new task and a new PR unless explicitly correcting an existing PR.
5. Every merged slice must update this roadmap in the same PR or in an immediately following documentation correction.
6. No SKU may introduce capabilities from a later phase.
7. No backlog SKU may be implemented until promoted to PLANNED.
8. Promotion requires explicit product and architectural justification.
9. Shopify remains the only implemented Catalog Source Adapter until a later SKU authorizes another provider.
10. Catalogged remains read-only until SKU-054 is explicitly authorized.
11. Agent Visibility remains a derived read model.
12. Product Identity Graph, External Product Observation, and Catalog Lineage must be shared primitives.
13. Do not invent causal explanations.
14. Do not present bounded evidence as complete.
15. Prefer eliminating complexity over introducing general frameworks.

## Roadmap maintenance log

- **2026-08-05 — Canonical roadmap established.** Repository structure, all refs and commit history, README and docs, Prisma schema and migrations, Shopify configuration, routes, services, and tests were inspected. SKU-001 through SKU-016 are proven merged on the authoritative remote main branch. SKU-017 is present only on remote review branch `codex/aplica-correccion-a-a-sku-017-pr-#24` and is therefore `IN_REVIEW`.
- **Historical-title note.** README headings use shortened lowercase labels for several SKUs, while commit subjects sometimes add verbs or different capitalization. Titles here follow the implemented capability and strongest commit/README evidence. Specifically: SKU-001 is “Shopify foundation” (README says “Shopify Foundation”); SKU-002 is “Catalog monitor foundation” (README introductory prose shortens it to “Monitor Foundation”); SKU-004 is “Catalog snapshot engine” (commit) while its README section says “catalog snapshots”; SKU-005 is “Catalog activity timeline”; SKU-011 is “Historical finding occurrence drilldown”; SKU-012 is “Bounded catalog finding activity”; SKU-014 is “Deployment and embedded app validation” based on the runbook, while commit prose says “validate Render and Shopify deployment”; and SKU-015/016 capitalization and verb forms vary between merge commits and implementation commits. These are naming ambiguities only, not evidence of additional SKUs.
- **2026-08-05 — Integrated on current main.** Local `main` was fast-forwarded to the latest available `origin/main` at `1cd6f3a` before integration. Current-main README prose, SKU-015/016 presentation code, routes, services, tests, schema, migrations, and Shopify configuration were preserved and revalidated. SKU-017 was separately inspected from its review branch and remains `IN_REVIEW`; no SKU-018–SKU-058 implementation or identifier collision was found.
