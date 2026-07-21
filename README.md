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

| Variable | Purpose |
| --- | --- |
| `SHOPIFY_API_KEY` | Public client ID for the selected Shopify app. |
| `SHOPIFY_API_SECRET` | Secret supplied by Shopify; never commit it. |
| `SHOPIFY_APP_URL` | Public HTTPS application URL. |
| `SCOPES` | Must remain `read_products` for this slice. |
| `DATABASE_URL` | Prisma URL; use `file:./dev.sqlite` locally. |

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

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Shopify CLI development flow and embedded app tunnel. |
| `npm run setup` | Generate Prisma Client and apply migrations. |
| `npm run build` | Produce the React Router server/client bundle. |
| `npm run typecheck` | Generate route types and run strict TypeScript checks. |
| `npm run lint` | Run ESLint. |
| `npm test` | Run the test suite once with Vitest. |
| `npm run check` | Run typecheck, lint, tests, and build in sequence. |
| `npm start` | Serve a previously built production bundle. |

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
