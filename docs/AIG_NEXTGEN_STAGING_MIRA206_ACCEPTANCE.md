# AIG NEXTGEN — Staging integration and MIRA-206 end-to-end acceptance

Date: 2026-11-08 | **DRAFT — NO GO-LIVE**
Based on ORCA SaaS PR #19, robotics safety PR #20 and finance foundation PR #85.
The release branches are not merged; test results and live data have not been verified.

## 1. Why the supplied launch design is not deployable
- ORCA currently uses Fastify + node-postgres + Node >=22 + Node test runner; pasted Next/Prisma/Jest logic does not map to ORCA.
- Repository already has a staged multi-stage Dockerfile. The supplied Node 20 Dockerfile conflicts with >=22, and its `dist/server.js` entrypoint is incorrect; ORCA uses `dist/src/main.js`.
- No `request.session.user` exists in ORCA. The verified bearer session resolves to `request.oceanPrincipal` and tenant-scoped PostgreSQL context.
- The sample handler unconditionally reports `ledgerValidationPassed:true`, implying successful financial validation when no adapter has been contacted. It must fail closed until a real adapter is tested.
- Trusting arbitrary `tenantId` and `propertyId` from user requests as authoritative is prohibited.
- An ORCA SaaS tenant is not automatically a Maldives legal entity or a MIRA registrant; entity delegation must be explicit.

## 2. Implemented staging-only endpoint
`POST /v1/staging/control-plane/validate`: authenticated through existing ORCA `onRequest` hook.
- Strict target domain enum: FINANCE_CORE, ROBOTICS_DISPATCH, BUILDINGS_IOT.
- Rejects missing session context; rejects conflicting tenant ID without leakage.
- FINANCE_CORE, ROBOTICS_DISPATCH and BUILDINGS_IOT return 503 + `executed:false` until property-scoped membership, certified adapters, and signed approval delegation exist.
- **No** financial journal mutations, MIRA submission, robot dispatch, smart-lock key issue or remote API calls.

## 3. MIRA 206 — minimum end-to-end UAT flow (FINANCE CORE authority only)
1. Import/verify authentic MIG tax registration and filing frequency; do not assume every MIG business is tourism-registered.
2. Select closed/open reporting period based on actual registration; provision historically effective-dated rule versions and official MIRA 206 form mapping confirmed from source documentation.
3. Prepare **synthetic** accommodations, service-charge, valid tax-invoice credit, credit-note, non-taxable/exempt, deposit and cancellation fixtures. Include boundary dates around 2025-07-01.
4. Authorize tenant and legal-entity test user independently; reject wrong entity and maker self-approval.
5. Post balanced, exact-currency journal fixtures and separate tax events inside LedgerOS staging DB. Reject unbalanced, FX-missing and duplicate source IDs.
6. Reconcile output tax, deductible input tax, adjustments and final payable against the official MIRA 206 fields; require accounting/controller independent signed evidence. Keep totals UNKNOWN until reconciled.
7. Render CFO read-only workpaper; verify both positive/negative tests, exact references, version and sample values against independent calculations.
8. Confirm never sending an unapproved tax payload to MIRAconnect. If a test adapter exists, require sandbox-only endpoint and an explicit disable-by-default capability flag.
9. Retain reconciliation hash, period, entity, test fixture version, reviewer and results. Mark FILED only on genuine portal receipt—never in synthetic UAT.
10. Run rollback/restore, RLS, permission and backup tests in staging. Independently validate final mappings with qualified Maldives tax adviser.

### Acceptance criteria
- Cross-company unauthorized read/write = 0 in tested negative paths.
- Every posted journal balanced per entity/currency and reconciled to tax-event ledger.
- Every MIRA 206 workpaper box traces to source events and verified form version.
- No fabricated bank balances, registrations, return filing status or robot state.
- Finance remains the authoritative ledger; ORCA only routes controlled status/requests.

## 4. Release dependency map
1. ORCA PR #19: security baseline merged after its own tests, MFA and private staging.
2. Robotics PR #20: build and prove its simulation-only constraints after PR #19.
3. This staging PR: validate on authenticated two-tenant environment and migrate no live finance data.
4. LedgerOS PR #85: independently implement entity-scoped journal controls and MIRA workpaper checks.
5. Only then propose a versioned ORCA-to-LedgerOS adapter contract and finance UAT, still with MIRA filing disabled.

No release authorization, hardware commands, data migration, secrets rotation or production deployment occurred as part of this PR.
