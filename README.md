# Skuard

> Skuard is the observability layer for Shopify catalog operations.

This repository contains **SKU-001 — Shopify Foundation**: a minimal embedded Shopify app built with the official React Router architecture, TypeScript, npm, Prisma session storage, and the GraphQL Admin API toolchain. This slice establishes the application shell only. **It does not monitor catalog changes yet.**

## Current scope

- Embedded Shopify admin application named Skuard.
- OAuth/session foundation backed by Prisma and local SQLite.
- A single read-only Shopify scope: `read_products`.
- Minimal, honest foundation screen.
- Type checking, linting, tests, and production-bundle validation through one quality gate.
- Shopify lifecycle webhooks required to maintain app sessions and granted-scope state.

SKU-001 deliberately contains no snapshots, events, diffs, incidents, timeline, blast radius, mutations, rollback, auto-revert, policies, billing, AI, inventory, orders, customers, or ERP/PIM/pricing integrations. No Skuard domain models are present.

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

The landing screen confirms that foundation initialization is complete; catalog monitoring arrives in a later slice.

## Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Shopify CLI development flow and embedded app tunnel. |
| `npm run setup` | Generate Prisma Client and apply migrations. |
| `npm run build` | Produce the React Router server/client bundle. |
| `npm run typecheck` | Generate route types and run strict TypeScript checks. |
| `npm run lint` | Run ESLint. |
| `npm test` | Run foundation tests once with Vitest. |
| `npm run check` | Run typecheck, lint, tests, and build in sequence. |
| `npm start` | Serve a previously built production bundle. |

Always use `npm run check` as the repository quality gate before pushing.

## Prisma and sessions

`prisma/schema.prisma` contains only Shopify's required `Session` model. The initial migration creates that table. Do not introduce Skuard business entities until their owning product slice. For a clean local database, delete `prisma/dev.sqlite` and rerun `npm run setup`.

## Troubleshooting

- **CLI cannot identify an app:** run `npm run config:link`, then retry `npm run dev`.
- **OAuth redirects fail:** allow Shopify CLI to update development URLs and confirm the app URL is HTTPS.
- **Prisma reports a missing database/client:** confirm `DATABASE_URL=file:./dev.sqlite`, then run `npm run setup`.
- **Scope mismatch:** ensure both `.env` and `shopify.app.toml` contain only `read_products`, then reinstall/update the app grant.
- **Dependency install fails:** verify access to the npm registry and that your proxy/registry configuration permits `@shopify/*` packages.

## Scaffold provenance and repository initialization

The repository initially contained only this README. The official Shopify CLI/template endpoints were attempted first, but this execution environment rejected npm and GitHub access with HTTP 403. The foundation therefore mirrors the current official Shopify React Router template structure rather than claiming a successful CLI generation. Run `npm install && npm run setup && npm run check` in a network-enabled environment to materialize dependencies and verify the exact resolved toolchain.

## Next slice

**SKU-002 — Monitor Foundation** will introduce the first catalog-observability primitives. Until then, this application performs no monitoring and makes no Shopify mutations.
