# Deployment and embedded-app validation

This runbook validates repository readiness, a Render deployment, and the embedded Shopify Admin experience. Repository checks do **not** prove external deployment. Record each external check as **PASSED**, **FAILED**, **BLOCKED**, or **NOT APPLICABLE**; do not infer success.

## Render setup

1. In Render, create a Blueprint from the Git repository and select the branch containing root-level `render.yaml`.
2. Confirm the Blueprint creates exactly one Node web service on the Starter plan with one instance. Do not add workers, cron jobs, queues, databases, or other services.
3. Confirm Node is `20.19.4`, build is `npm ci && npm run prisma -- generate && npm run build`, and start is `npm run start:render`.
4. Confirm `/health` is the health-check path. After deployment, request it and require HTTP 200, JSON content type, and the exact body `{"status":"ok"}`.
5. Confirm a persistent 1 GB disk is mounted at `/var/data`. Never run more than one service instance against this SQLite file.

### Environment variables

The Blueprint fixes `DATABASE_URL=file:/var/data/skuard.sqlite` and `SCOPES=read_products`. Supply these environment-specific values in Render without committing them:

| Name | Required value |
| --- | --- |
| `SHOPIFY_API_KEY` | Partner app client ID |
| `SHOPIFY_API_SECRET` | Partner app client secret |
| `SHOPIFY_APP_URL` | Final public HTTPS Render service origin, with no trailing path |

Render supplies `PORT`; do not hard-code it. Keep credentials out of Blueprint values, Git, logs, screenshots, and validation notes.

### Database and migrations

The persistent SQLite database is `/var/data/skuard.sqlite`. The start script runs `prisma migrate deploy`, applying only committed migrations before starting the built React Router server. It does not use `db push`, reset, or seed. Back up or replace the disk only through an explicitly approved operational process; recovery and rollback are outside this runbook.

Inspect Render deploy and runtime logs for dependency, Prisma generation, migration, server bind, health-check, OAuth, session-storage, and webhook errors. Do not copy tokens, secrets, session rows, or merchant payloads into tickets.

## Shopify Partner configuration

In the Partner Dashboard, configure the same app represented by the Render credentials:

- App URL: the exact HTTPS value of `SHOPIFY_APP_URL`.
- Allowed redirection URL: `${SHOPIFY_APP_URL}/auth/callback`.
- Embedded app: enabled.
- API version: `2025-10`, matching `shopify.app.toml` and the server configuration.
- Requested scope: exactly `read_products`. Reject any configuration containing a write scope.

If URL, credentials, or scopes changed after an earlier install, uninstall and reinstall the development store app so OAuth uses the final configuration. Do not test with a production merchant store.

## OAuth and session validation

1. Open the app from the development store's Shopify Admin, complete installation or reinstall, and review the grant: it must request only `read_products`.
2. Confirm OAuth returns through `/auth/callback` to the embedded app without a redirect loop or host/session error.
3. Reload the Admin page and reopen it in a new browser tab. Confirm the authenticated session persists through the SQLite-backed session storage and remains isolated to the installed shop.
4. Confirm the application stays inside the Shopify Admin iframe, App Bridge initializes, and browser developer tools show no CSP/frame-ancestor, mixed-content, blocked-script, or unhandled runtime errors.

## Catalog smoke test

Using non-sensitive development-store catalog activity, verify all existing read-only surfaces without changing products from Skuard:

- the catalog timeline loads, filters compose correctly, and its pagination remains bounded;
- finding activity displays factual occurrences and its pagination advances independently of the timeline and overview;
- the detection overview groups returned findings, its allow-listed filters work, and its pagination is independent;
- an occurrence opens the exact adjacent comparison and preserves the selected comparison;
- resource history and structural comparison show explicit empty or non-comparable states when no baseline exists;
- empty timeline, finding activity, detection overview, filtered results, and comparison states render without errors.

Review Render logs and the browser console during OAuth and every smoke-test step. The app must make no Shopify mutation or write request.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Blueprint not found | Render is using the branch that contains root-level `render.yaml`, not an older `main`. |
| Build fails | Node is `20.19.4`; lockfile is committed; Prisma generation and React Router build output precede the error. |
| Migration or SQLite error | Disk is mounted at `/var/data`, `DATABASE_URL` is exact, the service has one instance, and the disk is writable. |
| Health check fails | Service bound to Render-provided `PORT`; `/health` returns exact JSON without authentication. |
| OAuth redirect mismatch | Partner App URL, callback URL, `SHOPIFY_APP_URL`, scheme, host, and trailing paths agree. |
| Reauthorization or scope loop | Partner scope and `SCOPES` are exactly `read_products`; reinstall after configuration changes. |
| Embedded page is blank | Inspect Render logs plus browser network, console, iframe, App Bridge, and CSP errors. |
| Catalog data is absent | Confirm authenticated shop, webhook delivery, committed migrations, and explicit empty-state behavior; do not fabricate data. |

## Validation record and human sign-off

External checks start as **BLOCKED** until a person with Render, Partner Dashboard, and development-store access performs them.

| Check | Status | Evidence / reviewer |
| --- | --- | --- |
| Render Blueprint creation and deploy | BLOCKED | Requires external Render access |
| Persistent disk and migration execution | BLOCKED | Requires Render service and logs |
| Production `/health` | BLOCKED | Requires deployed public URL |
| Partner URLs, embedded mode, API version, and scope | BLOCKED | Requires Partner Dashboard access |
| Install/reinstall, OAuth, and persistent session | BLOCKED | Requires development store access |
| iframe, App Bridge, CSP, and browser console | BLOCKED | Requires embedded Admin session |
| Catalog smoke test and independent pagination | BLOCKED | Requires embedded Admin and suitable test data |
| Shopify mutation/write audit | BLOCKED | Repository audit can pass; runtime evidence remains external |

The human reviewer must replace each status with **PASSED**, **FAILED**, **BLOCKED**, or **NOT APPLICABLE**, attach sanitized evidence, record their name and UTC time, and explicitly sign off. Any **FAILED** item blocks deployment approval. **BLOCKED** is not a pass.
