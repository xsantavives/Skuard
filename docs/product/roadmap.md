# Catalogged Technical State and Active Bet

## Purpose and authority

This file is a repository-local technical record. It is **not** the canonical product roadmap and does not authorize future product work.

The sources of truth are:

- **Notion — Catalogged:** thesis, state, hypotheses, evidence, decisions, Raw Ideas, pitches, and bets: <https://app.notion.com/p/3b4cb152b27181a29d67d962d5c11abc>
- **Linear — CAT — First Catalog Incident:** execution of the single active bet: <https://linear.app/xsvlabs/project/cat-first-catalog-incident-bb4f4bb80feb>
- **GitHub:** merged implementation, open pull requests, migrations, tests, configuration, and deployable technical reality.

A repository document, branch, pull request, issue, or former SKU description does not approve work outside the active bet.

## Product thesis

Catalogged is a Shopify Catalog Revenue Integrity platform based on catalog observability.

It should help merchants reconstruct catalog state and changes, understand evidence, detect commercially relevant failures, and only later consider recovery.

The mandatory evolution is:

**Observe → Understand → Detect → Recovery planning → Controlled recovery → Optional automation**

Phases must not be skipped. Catalogged must not become prematurely:

- a catalog editor or PIM;
- a general automation platform;
- a rollback product;
- a pricing optimization product;
- an AI-generated explanation layer that substitutes evidence.

## Current non-negotiable boundaries

Until a later explicit decision and approved bet changes them:

- Shopify access is read-only.
- The only Shopify scope is `read_products`.
- No Shopify mutation or write scope is allowed.
- No rollback, auto-remediation, billing, or generative AI is in scope.
- No broad policy engine is allowed before observability is proven with real incidents.
- No additional commerce platform or catalog source is authorized.
- Every query and read model must remain bounded, deterministic, authenticated, shop-isolated, and explicit about incomplete evidence.

### Persistence and evidence model

- `CatalogWebhook` is authenticated transport evidence.
- `CatalogSnapshot` is an immutable projection derived from a webhook.
- The timeline and comparison experiences are bounded read models over immutable snapshots.
- No mutable current-catalog projection should be introduced without a separately justified future slice.
- Raw webhook or snapshot payloads must not be exposed in merchant interfaces.

## Active bet

### CAT — First Catalog Incident

- **Status:** In Progress
- **Start:** 6 August 2026
- **Appetite:** 10 working days
- **Circuit breaker:** 19 August 2026
- **Primary risk:** Desirability

### Problem

Catalogged has a technically disciplined observability foundation but has not proved that a real merchant experiences catalog changes that are important enough to monitor repeatedly.

### Outcome sought

Connect one real Shopify store, capture authoritative catalog evidence, reconstruct at least one relevant product or variant change, present what changed and when, and obtain an observable merchant reaction.

### In scope

- Connect one real Shopify store.
- Capture an initial authoritative state from allowed Shopify evidence.
- Capture at least one later product or variant change.
- Reconstruct the change deterministically from retained evidence.
- Present the evidence without overstating completeness or causality.
- Ask the merchant whether the change matters and whether monitoring should continue.

### Explicit exclusions

- External retailers, marketplaces, commerce surfaces, or AI-agent observations.
- Broad integrity-check catalogs or configurable policies.
- Incidents, alerts, recovery planning, rollback, or mutations.
- Auto-remediation, AI-generated explanations, and billing.
- Multiple platforms or additional Shopify scopes.

### Done

A real merchant has connected a store, observed a genuine change, understood the evidence, and evaluated whether Catalogged should continue monitoring.

### Evidence expected

- A store is connected and evidence is captured.
- At least one commercially relevant change is reconstructed.
- The merchant requests continued monitoring, alerts, another review, or a continued pilot.

### Kill or reshape condition

If the appetite produces no real store connection, no relevant change, or no observable request to continue, Catalogged must not expand into policies, external observation, recovery, or automation. The bet must be reshaped or killed.

## Repository-proven technical state

The authoritative `main` branch is currently at `24e9cb91c2f4b1ab4d79c80206f7313c0fbc9728`. That commit added the former exhaustive roadmap and did not add product capability.

| Slice | Capability | Repository state | Evidence |
| --- | --- | --- | --- |
| SKU-001 | Shopify foundation | MERGED | `4a376ec`, `94e5fcf` |
| SKU-002 | Catalog monitor foundation | MERGED | `ace7b9a` |
| SKU-003 | Product and collection event coverage | MERGED | `a8e6d43` |
| SKU-004 | Immutable catalog snapshot engine | MERGED | `899c655` |
| SKU-005 | Catalog activity timeline | MERGED | `6fc9d7c` |
| SKU-006 | Bounded structural catalog diff | MERGED | `f44b276` |
| SKU-007 | Deterministic change taxonomy | MERGED | `57ef1a3` |
| SKU-008 | Deterministic change signals | MERGED | `bd926d6` |
| SKU-009 | Deterministic comparison findings | MERGED | `498ee51` |
| SKU-010 | Bounded historical finding summary | MERGED | `2526b88` |
| SKU-011 | Historical occurrence drilldown | MERGED | `942402f` |
| SKU-012 | Bounded catalog finding activity | MERGED | `478f46c`, fixes `95ee98c`, `434da3f` |
| SKU-013 | Catalog detection overview | MERGED | `7c79efa` |
| SKU-014 | Deployment and embedded validation foundation | MERGED | `9c41e9c` |
| SKU-015 | Merchant catalog observability experience | MERGED | `a8ba613` |
| SKU-016 | Merchant visual design and interaction | MERGED | `1cd6f3a` |
| SKU-017 | Identity-aware variant pricing evidence | IN REVIEW | PR #24, head `fd3261b39f1ac6de4418eabfe67f34fa6ec7a8c4` |

### Open PR #24

PR #24 remains open and is not merged into `main`. It introduces conservative identity-aware variant pricing evidence and explicit coverage qualification. Authenticated embedded visual validation remains outstanding.

Its existence does not authorize merchant-wide pricing activity, policies, alerts, incidents, or later pricing SKUs. Before merge, it must be evaluated against the active bet and reviewed for architecture, boundedness, determinism, shop isolation, tests, Shopify compatibility, and the remaining visual checks.

## Disposition of the former future roadmap

On 6 August 2026, the future roadmap was removed as an authorization mechanism. Former planned and backlog SKUs were consolidated into problem-oriented Notion Raw Ideas rather than copied one-for-one.

| Former roadmap content | Notion Raw Idea | Current status |
| --- | --- | --- |
| SKU-019–SKU-021 | [Merchant catalog evidence workflows](https://app.notion.com/p/3b4cb152b27181dbbfe0c6bcbdfa67a7) | Raw; opinion only |
| SKU-022–SKU-027 | [Deterministic official catalog integrity](https://app.notion.com/p/3b4cb152b27181749f8bd34360a440e6) | Raw; opinion only |
| SKU-028–SKU-045 and SKU-B01 | [External catalog representation integrity](https://app.notion.com/p/3b4cb152b27181f4a9bedb8324794b5e) | Raw; opinion only |
| SKU-039–SKU-040 and SKU-046–SKU-047 | [Evidence-based agent visibility](https://app.notion.com/p/3b4cb152b27181f1a251fc9530435a7d) | Raw; opinion only |
| SKU-048–SKU-050 | [Operational catalog incidents](https://app.notion.com/p/3b4cb152b2718161aadee4a0c26d9056) | Raw; opinion only |
| SKU-051–SKU-053 | [Recovery planning](https://app.notion.com/p/3b4cb152b2718145b455fe3dd21507ba) | Raw; opinion only |
| SKU-054–SKU-055 | [Controlled catalog recovery](https://app.notion.com/p/3b4cb152b2718179a850d0f11dc07701) | Raw; opinion only |
| SKU-056–SKU-057 | [Preventive catalog controls](https://app.notion.com/p/3b4cb152b2718171a006c94bb675d95a) | Raw; opinion only |
| SKU-058 | [Optional low-risk remediation](https://app.notion.com/p/3b4cb152b27181d4b291d6697679564a) | Raw; opinion only |

The former SKU-018 visible Skuard-to-Catalogged identity migration is not treated as a standalone future product idea. It must be reviewed as possible enabling work for the current merchant pilot and included in Linear only if the active bet genuinely requires it.

The original exhaustive roadmap remains recoverable from Git history at commit `24e9cb91c2f4b1ab4d79c80206f7313c0fbc9728`. Historical preservation does not grant implementation authorization.

## Work-selection rule

There is no automatic “next SKU.”

During the active bet, work is selected only from the approved scopes in Linear and cut aggressively when it does not contribute to the first real incident or merchant evidence.

After the bet closes:

1. Review execution and merchant evidence.
2. Record the outcome as Shipped, Repeat, Reshape, or Killed.
3. Promote a Raw Idea only when repeated evidence justifies shaping.
4. Complete a pitch with problem, appetite, solution, rabbit holes, no-gos, done, evidence threshold, and kill criteria.
5. Create a new bet and Linear project only after explicit approval.

## Technical delivery rules

Every approved technical slice must be:

- vertical, incremental, bounded, deterministic, idempotent, and shop-isolated;
- implemented as a new task and a new pull request unless correcting an existing PR;
- delivered with implementation, configuration, migrations where needed, tests, architecture review, and verifiable summary;
- represented by one intentional commit before merge;
- reviewed against Shopify scopes, webhook authentication, tenant isolation, bounded queries, allow-listed filters, and sensitive-data handling.

Repository content determines what is actually merged. Do not infer implementation from roadmap text or compare sandbox and remote SHAs as proof of equivalence.

## Governance decision

The governing Notion decision is:

[Catalogged no mantiene un backlog de SKUs futuros en GitHub](https://app.notion.com/p/3b4cb152b27181d396fdfdd9a89b9b5c)

Reopening the former roadmap requires new merchant evidence, a real constraint change, or an explicit governance decision. Convenience, architectural enthusiasm, or the existence of an old SKU description is insufficient.

## Maintenance log

- **2026-08-05:** Repository-proven merged history through SKU-016 and open PR #24 were documented in an exhaustive roadmap.
- **2026-08-06:** Future SKU sequencing and strategic backlog were removed as product authorization. The file was converted into a technical-state and active-bet record; future opportunities moved to Notion Raw Ideas.
