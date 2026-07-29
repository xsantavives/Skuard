# Skuard

> Skuard is the observability layer for Shopify catalog operations.

This repository preserves **SKU-001 — Shopify Foundation** and adds **SKU-002 — Monitor Foundation**, the first, Observe-only catalog monitoring slice. The app uses the official React Router architecture, TypeScript, npm, Prisma session storage, and the GraphQL Admin API toolchain.

## Current scope

- Embedded Shopify admin application named Skuard.
- OAuth/session foundation backed by Prisma and local SQLite.
- A single read-only Shopify scope: `read_products`.
- Authenticated, idempotent observation of `products/create`, `products/update`, and `products/delete`.
- An authenticated `/app/diagnostics` route for internal operational inspection only.
- Type checking, linting, tests, and production-bundle validation through one quality gate.
- Shopify lifecycle webhooks required to maintain app sessions and granted-scope state.

The roadmap is **Observe → Understand → Detect → Recovery planning → Controlled recovery → Optional automation**. SKU-002 belongs only to Observe: it retains each complete authenticated webhook payload as canonical JSON but adds no semantic interpretation, merchant timeline, normalized snapshots, batch detection, blast radius, incidents, policies, alerts, recovery, billing, AI, automation, Shopify write scope, or Shopify write operation. Payload retention is an ingestion capability, not a product snapshot or timeline.

## Prerequisites

- Node.js 20.10 or newer and npm.
- A Shopify Partner account and development store.
- Shopify CLI (installed by `npm install` through the app dependency/toolchain).
- A public HTTPS tunnel; Shopify CLI manages one during normal development.

## Install and configure

```bash
npm install
cp .env.example .env
npm run setup
```

`npm run setup` generates Prisma Client and applies committed migrations. SQLite is intentionally used for local foundation development; its database file is ignored by Git.

### Environment variables

| Variable             | Purpose                                        |
| -------------------- | ---------------------------------------------- |
| `SHOPIFY_API_KEY`    | Public client ID for the selected Shopify app. |
| `SHOPIFY_API_SECRET` | Secret supplied by Shopify; never commit it.   |
| `SHOPIFY_APP_URL`    | Public HTTPS application URL.                  |
| `SCOPES`             | Must remain `read_products` for this slice.    |
| `DATABASE_URL`       | Prisma URL; use `file:./dev.sqlite` locally.   |

`.env.example` contains placeholders only. When using `shopify app dev`, the CLI supplies Shopify values to the web process. Link the repository's placeholder configuration to an app before development:

```bash
npm run config:link
```

Review the generated/local configuration before accepting changes; never commit a real secret. The committed `shopify.app.toml` declares only `read_products`.

## Connect a development store

1. Create an app in the Shopify Partner Dashboard (or let Shopify CLI select/create one).
2. Run `npm run config:link` and choose that app.
3. Run `npm run dev`, select the development store, and follow the install URL printed by Shopify CLI.
4. Approve the single `read_products` permission. The app opens embedded in Shopify Admin.

The landing screen remains intentionally minimal. `/app/diagnostics` is an internal diagnostic surface, not a merchant-facing timeline.

## Commands

| Command             | Description                                                     |
| ------------------- | --------------------------------------------------------------- |
| `npm run dev`       | Start the Shopify CLI development flow and embedded app tunnel. |
| `npm run setup`     | Generate Prisma Client and apply migrations.                    |
| `npm run build`     | Produce the React Router server/client bundle.                  |
| `npm run typecheck` | Generate route types and run strict TypeScript checks.          |
| `npm run lint`      | Run ESLint.                                                     |
| `npm test`          | Run the test suite once with Vitest.                            |
| `npm run check`     | Run typecheck, lint, tests, and build in sequence.              |
| `npm start`         | Serve a previously built production bundle.                     |

Always use `npm run check` as the repository quality gate before pushing.

## Prisma persistence

`prisma/schema.prisma` retains Shopify's required `Session` model and adds `CatalogWebhook`. The webhook ID is unique for idempotency; records include the complete authenticated payload as parseable canonical JSON, a SHA-256 hash calculated from that exact string, optional product resource ID and occurrence time, and `RECEIVED`, `PROCESSED`, or `FAILED` state. For a clean local database, delete `prisma/dev.sqlite` and rerun `npm run setup`.

## Troubleshooting

- **CLI cannot identify an app:** run `npm run config:link`, then retry `npm run dev`.
- **OAuth redirects fail:** allow Shopify CLI to update development URLs and confirm the app URL is HTTPS.
- **Prisma reports a missing database/client:** confirm `DATABASE_URL=file:./dev.sqlite`, then run `npm run setup`.
- **Scope mismatch:** ensure both `.env` and `shopify.app.toml` contain only `read_products`, then reinstall/update the app grant.
- **Dependency install fails:** verify access to the npm registry and that your proxy/registry configuration permits `@shopify/*` packages.

## Scaffold provenance and repository initialization

The repository initially contained only this README. The official Shopify CLI/template endpoints were attempted first, but this execution environment rejected npm and GitHub access with HTTP 403. The foundation therefore mirrors the current official Shopify React Router template structure rather than claiming a successful CLI generation. Run `npm install && npm run setup && npm run check` in a network-enabled environment to materialize dependencies and verify the exact resolved toolchain.

## Monitor behavior

Every catalog route calls `authenticate.webhook` before the shared ingestion service. Duplicate webhook IDs return success without creating another record. Persistence failure returns HTTP 500 so Shopify can retry. The application makes no Shopify mutations and retains `read_products` as its only scope.

## SKU-004 catalog snapshots

`CatalogWebhook` remains the immutable raw authenticated transport evidence. `CatalogSnapshot` is a separate, immutable deterministic projection created from that retained evidence after deployment: one source webhook can create zero or one snapshot, enforced by a unique relationship.

For product and collection create/update topics, the snapshot state is the complete payload in canonical JSON and `isDeleted` is false. For delete topics, the complete authenticated delete payload is retained unchanged in meaning as canonical tombstone state and `isDeleted` is true; no absent fields are invented. In every case, `stateHash` is SHA-256 of the exact canonical string stored in `state`. Projection never fetches Shopify data, merges prior state, or mutates a snapshot.

Coverage is limited to product and collection create, update, and delete webhooks. The authenticated internal diagnostics section is shop-scoped, bounded, filterable, and displays snapshot metadata only—not state or raw webhook payloads.

Snapshots begin with webhooks processed after SKU-004 deployment. Historical `CatalogWebhook` evidence remains retained, but historical backfill is outside this slice. SKU-004 also excludes comparison and diffing, changed-field extraction, mutable current state, merchant timelines, policies, incidents, alerts, reconciliation or polling, Admin API fetching, variants/inventory/publications/metafields as separate snapshots, recovery, billing, AI, automation, write scopes, mutations, and all Shopify writes.

## SKU-005 catalog activity timeline

The authenticated `/app/catalog` route is the merchant-facing catalog activity timeline; `/app/diagnostics` remains a separate internal operational view. Timeline entries are a metadata-only read model queried directly from immutable `CatalogSnapshot` records. There is no `CatalogTimeline` table, denormalized activity persistence, or mutable current-state projection.

Lifecycle actions are derived only from the source topic: `products/create` and `collections/create` map to **Created**, update topics map to **Updated**, and delete topics map to **Deleted**. The deterministic newest-first ordering is effective event time (`occurredAt` when present, otherwise `receivedAt`), then `receivedAt`, `createdAt`, and snapshot ID. The main timeline uses opaque full-ordering-tuple cursor pagination, defaults to 25 entries, and is capped at 50; resource type, action, topic, and tombstone status filters are allow-listed and always composed with authenticated-shop isolation.

`/app/catalog/:resourceType/:resourceId` provides up to 25 recent events (bounded at 50) for one exact shop-scoped resource using the same ordering. Its current status is derived from the newest snapshot: a tombstone means **Deleted**, while a non-tombstone means **Active**. Deleted resource history therefore remains visible without a mutable current-state table.

Activity begins only with snapshots produced after SKU-004 deployment; retained earlier webhook evidence is not backfilled. SKU-005 intentionally does not parse snapshot state for names or other attributes and adds no field comparison, structural or semantic diff, changed-field extraction, Shopify fetch, write operation, policy, incident, alert, notification, recovery, billing, AI, or automation.

## SKU-006 structural catalog diff

Structural Diff is an on-demand, shop-scoped read model over adjacent immutable `CatalogSnapshot` states; it creates no `CatalogDiff` table and persists or caches no calculated diff. The resource-history screen can compare an exact selected snapshot only with its immediately preceding snapshot under SKU-005's effective-time, received-time, created-time, and snapshot-ID ordering.

Only an update following an active snapshot is comparable. A first snapshot or creation has no baseline, a deletion tombstone is never field-compared, and an active snapshot after a tombstone has no comparable baseline. Unsupported or inconsistent lifecycle data fails closed. Tombstones are not reconstructed or merged and the app does not fetch Shopify state.

Comparison recursively walks objects by lexicographically sorted keys and arrays by ascending numeric position. Missing properties or indexes are Added or Removed; unequal scalars and JSON type changes are Changed. Paths use RFC 6901 JSON Pointer (the root is the empty pointer, `~` becomes `~0`, and `/` becomes `~1`). Positional array comparison is deliberately identity-unaware and can be noisy when Shopify reorders arrays; normalization and identity-aware matching belong to a later slice.

A comparison is capped at depth 32, 20,000 visited nodes, and 200 returned changes. Merchant rendering is capped at 500 characters per changed value, labels missing separately from JSON `null`, and summarizes arrays and objects with bounded canonical previews. Limit hits are explicitly reported as truncated rather than presented as complete. Only changed values are rendered—never complete snapshots, webhook payloads, hashes, delivery metadata, processing errors, or shop identity.

SKU-006 remains in **Understand** and performs structural description only. It adds no semantic interpretation, importance, severity, risk, anomaly detection, policy, incident, alert, notification, recovery planning, rollback, reconciliation, polling, backfill, Admin API fetch, billing, AI, automation, Shopify write scope, mutation, or write call.

## SKU-007 catalog change taxonomy

Catalog change taxonomy is calculated on demand after SKU-006's structural comparison and classifies only the returned paths. Its explicit allow-listed categories are deterministic and resource-type-specific. Complete decimal array-index segments are normalized to `*` only for classification; the exact structural JSON Pointer remains unchanged and visible. Malformed, unsupported, and unknown paths remain visible as **Other** (`OTHER`).

The category summary counts only returned entries in a fixed taxonomy order, so it does not imply counts for changes omitted by structural truncation. Classification is descriptive, not evaluative, and neither classifications nor summaries are persisted. This slice adds no severity, risk, anomaly, incident, policy, alert, recovery, AI, or automation. It also leaves SKU-006's positional, identity-unaware array comparison limitations unchanged.

## SKU-008 deterministic catalog change signals

SKU-008 is the first constrained **Detect** slice. Explicit, deterministic signals are calculated on demand only from the structural diff entries already returned by the bounded comparison. Allow-listed matching uses the resource type and SKU-007's valid, normalized JSON Pointer path semantics; the original exact path, operation, and raw JSON-compatible before/after values remain the evidence. Unmatched structural changes remain visible, and system metadata and unknown fields do not automatically create signals.

Signals and their fixed-order summaries are not persisted. Structural truncation therefore also limits signal completeness, and positional array evidence remains identity-unaware. This slice introduces no severity, risk, score, confidence, anomaly, policy, incident, alert, notification, recovery, AI, or automation.

## SKU-009 deterministic comparison findings

SKU-009 remains inside **Detect**. Factual findings are calculated on demand from the returned deterministic signals and summarize explicit signal families and combinations without inspecting snapshot state, structural paths, or raw values. Evidence counts refer only to returned signals; structural truncation therefore limits findings completeness.

Findings are not persisted and no historical analysis exists. This slice introduces no severity, risk, score, confidence, anomaly, policy, incident, alert, notification, recommendation, recovery, AI, or automation.

## SKU-010 bounded historical finding summary

SKU-010 remains inside **Detect**. Recent historical findings are calculated on demand for one exact authenticated-shop-scoped resource from a separately bounded snapshot window. Only adjacent snapshots in the established timeline order are candidate comparisons, and lifecycle eligibility matches the structural diff: invalid data, creations, tombstones, and updates immediately after tombstones fail closed without bypassing a snapshot.

The factual summary counts comparable comparisons separately from their returned signal evidence. Structural comparison, signal derivation, and finding derivation are reused unchanged; structurally truncated comparisons remain counted but may produce incomplete findings. Results and occurrences are not persisted, and there is no historical background processing. This slice adds no anomaly, threshold, policy, incident, alert, recommendation, recovery, AI, automation, Shopify fetch, mutation, or scope.

## SKU-011 historical finding occurrence drilldown

SKU-011 remains inside **Detect** and makes each bounded historical finding traceable to the exact adjacent comparisons where it appeared. Each occurrence reuses SKU-009's finding evidence count and links to the existing structural comparison; truncated evidence is explicitly qualified as returned and potentially incomplete.

Occurrences remain bounded, read-only, calculated on demand by SKU-010's single exact-resource query, and non-persisted. The summary includes no raw snapshot state and introduces no frequency or trend classification, anomaly, severity, policy, incident, recommendation, recovery, AI, or automation.

## SKU-012 bounded catalog finding activity

SKU-012 remains inside **Detect**. Recent catalog-wide finding activity is calculated on demand by one bounded, shop-scoped read that selects current snapshot candidates and resolves each exact immediate predecessor for the same resource. It reuses the shared lifecycle gate, structural diff, deterministic signals, and comparison findings; each displayed entry is a factual occurrence of findings in one exact adjacent comparison.

Cursor pagination follows candidate snapshots, including skipped and comparable zero-finding candidates; comparisons without findings are not displayed. Structural truncation explicitly limits the completeness of returned findings and evidence. The feed is read-only and non-persisted and introduces no frequency, trend, anomaly, severity, policy, incident, recommendation, recovery, AI, or automation.

## SKU-013 catalog detection overview

SKU-013 remains strictly inside **Detect**. The merchant catalog screen now groups the deterministic finding types present in a bounded recent candidate window and reports factual counts for exact adjacent comparisons, distinct `(resourceType, resourceId)` resources, returned evidence signals, structurally truncated contributing comparisons, and the latest exact occurrence. Each bounded occurrence links to the existing authenticated exact-comparison screen.

The architectural decision is a separate detection-overview read-model service rather than aggregation over SKU-012's presentation-specific activity page. One bounded, authenticated-shop-scoped query selects current candidates and their exact immediate predecessors. The service then reuses the existing lifecycle eligibility, structural diff (depth 32, 20,000 visited nodes, and 200 returned entries), signal, and finding primitives before pure deterministic in-memory aggregation. It defaults to 25 candidates (maximum 50) and five occurrences per group (maximum 10); groups remain bounded by the fixed finding-code allow-list. Results are calculated on demand from immutable `CatalogSnapshot` records and are never persisted, cached, materialized, or processed by a job.

Candidate-window truncation means older candidates were not analyzed, structural truncation means findings use only returned structural entries, and occurrence-list truncation means additional contributing comparisons in the analyzed window are not rendered. These qualifications are independent and the overview does not claim catalog-wide completeness. Allow-listed `PRODUCT`/`COLLECTION` and fixed finding-code filters are supported, while the opaque `overviewCursor` is independent from timeline and finding-activity pagination and advances across skipped and zero-finding candidates.

The overview adds no severity, risk, trend, anomaly, incident, policy, recommendation, recovery planning, automation, AI, billing, Shopify fetch, mutation, or scope. Shopify access remains exactly `read_products`.

## Deployment validation

## SKU-017 identity-aware variant pricing evidence

Product comparisons now derive price and compare-at price evidence by matching detailed variants by stable Shopify identity: a non-empty `admin_graphql_api_id` is preferred, with a non-empty string or finite integer `id` as the only fallback. Array position and merchant labels are never identity. Strict string-based decimal canonicalization treats equivalent recorded forms such as `10.00` and `10.0` as equal without floating-point arithmetic, while preserving recorded values for display.

Pricing coverage is **COMPLETE** only when `variant_gids` supplies a trustworthy expected identity set fully covered by detailed variants, **PARTIAL** when that set proves details are missing, and **UNVERIFIED** when completeness cannot be proved or a validation/safety limit is reached. Shopify product webhooks can include only a bounded detail subset, so qualified comparisons do not claim that unrepresented variants were unchanged. Evidence is bounded, deterministic, calculated on demand from immutable `CatalogSnapshot` states, and never persisted. This slice adds no Admin API fetching, catalog writes, mutation, scope, policy, incident, alert, recovery, automation, AI, or billing; Shopify access remains read-only with only `read_products`.

Use the [Render and embedded Shopify Admin deployment-validation runbook](docs/deployment-validation.md) to configure the production service and record external validation results.
