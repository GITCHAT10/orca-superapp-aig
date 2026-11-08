# OCEAN CLOUD — Implemented SaaS Control Plane v0.1

This repository now includes an executable **Node 22 / Fastify / TypeScript / PostgreSQL 16** SaaS control plane. It is a NEW public SaaS application **within the existing repository**; it does not clone BRAIN CORAL or rebuild individual hospitality/travel/retail systems.

## Implemented endpoints

- `GET /healthz`, `GET /readyz`
- `POST /v1/tenants/register` (UAT/dev only, disabled in production)
- `POST /v1/auth/login` and `POST /v1/auth/logout`
- `GET /v1/me`
- `GET /v1/modules`
- `PUT /v1/modules/:key/activation` (OWNER/ADMIN)
- `GET /v1/subscription` (TRIAL / PENDING_BILLING by default; no paid charge)
- `POST /v1/usage` (idempotent usage evidence, NOT a payment)
- `GET /v1/usage` and `GET /v1/audit`
- `POST/GET /v1/workflows/approvals` and `POST /v1/workflows/approvals/:id/decision` (two distinct authorized staff actors; no external execution)
- `GET/POST /v1/agents`; `PUT /v1/agents/:key/model-route` (catalog only, all disabled)
- `GET /v1/agents/model-routes`, `GET /v1/product-contracts` and `POST /v1/product-contracts/:key/register` (disconnected adapter registry)
- `GET /v1/outbox` (persisted delivery proposals; no dispatch worker)
- `POST /v1/objects`, `GET /v1/objects/:id` (AES-256-GCM encrypted small objects, 48 KiB max, tenant/object-bound AAD)


## Real isolation properties

Every authenticated request MUST provide a valid bearer session plus `x-ocean-tenant` slug. Server resolves tenant id and validates an active session scoped to that id. The tenant id comes from server-side tenant lookup and session, not request body. Row-level security is ENABLED and FORCEd for membership, session, entitlement, subscription, usage and audit tables. Tenant-scoped SQL always runs in a PostgreSQL transaction with `SET LOCAL app.tenant_id` before queries. The web service **MUST** run under a restricted non-owner `ocean_app` database role without BYPASSRLS and separately from the schema migration role.

Never treat OCEAN CLOUD as a privileged BRAIN CORAL client. No private MIG data, service secrets or credentials belong here.

## UAT bootstrap (do not use real clients or passwords)

1. Provision isolated PostgreSQL 16 and a non-owner `ocean_app` login with its own random secret. DO NOT reuse MIG database.
2. Configure `OCEAN_MIGRATION_DATABASE_URL` with distinct migration owner credentials and `OCEAN_DATABASE_URL` with non-owner role.
3. `npm ci`, `npm run db:migrate`, `npm run build`, `npm test`.
4. `OCEAN_SIGNUP_ENABLED=true npm run dev` only in dev/UAT. Production self-registration is hard-disabled even if env is true.
5. Use two separate synthetic tenants and owner email addresses. Call login, module activation and audit API with each tenant's own bearer session.

## What is NOT implemented

No BRAIN CORAL private access, actual vertical provisioning, live AI model calls, external payment provider, outbound mail, subscription invoicing, S3/object replica storage, password reset, MFA, rate limits at edge, enterprise SSO, qualified security audit, operational incident monitoring or production deployment. The initial small-object implementation uses PostgreSQL-backed ciphertext, not the planned external S3 adapter; configure OCEAN_STORAGE_KEY_HEX via a secure secret manager and rotate keys with a reviewed plan. Module activation writes a database entitlement and audit entry but explicitly returns `provisioned:false`. Do not advertise complete product availability.

## Required release gates

Implement registration invitation/verification, origin/CORS constraints, production session rate limiting, MFA/SSO, secure secret management, signed adapters, persistent workflow approvals, recoverable backups, fuller operational observability, CI dependency security scan, and explicit infrastructure/operator authorization. No production migration or deploy from this branch.

Documentation and static marketplace content retained.

## 7 November 2026 security hardening / outstanding blockers

- The SaaS CI dependency gate now runs `npm audit --audit-level=high`. CI identified high-severity Fastify and Zod findings; Fastify was updated to 5.12.8 and Zod to 4.6.7. The latest CI dependency audit reported **zero vulnerabilities**.
- Failed credential attempts against an existing tenant account are tracked in `ocean_auth_failures` with PostgreSQL FORCE RLS; after five consecutive failures, the login endpoint fails closed for 15 minutes. A valid login clears this history. Tests exercise the lockout and show a second tenant remains available. This is not a replacement for network/IP-based distributed rate limits and MFA.
- The dependency lockfile is committed in `package-lock.json`; CI now uses `npm ci` and verifies `npm audit --audit-level=high` before build and PostgreSQL integration tests. The temporary one-time workflow used to generate the lockfile has been deleted, removing its write-capability entry point.
- Password account recovery, verified email ownership/invitation flow, enterprise MFA/SSO, central identity lifecycle, immutable external audit, tested key rotation and verified production deployment remain blocked.

## Latest integrity gate — November 7, 2026

The usage meter now enforces **semantic idempotency**: reusing an existing tenant/idempotency key with a changed module, quantity or recording actor returns HTTP 409, not a success-shaped duplicate. Real PostgreSQL integration tests verify an exact duplicate is acknowledged only once and conflicting replays fail. A direct SQL negative-test matrix also verifies that all thirteen FORCE-RLS tables reject a different tenant's reads and that cross-tenant writes fail the database policy.

This is **internal UAT usage evidence, not an authoritative invoice or financial settlement**. Do not enable external billing until provider settlement, signed source metering, reconciliation, disputed-usage handling and finance approvals are tested. The current branch is not production-deployed.

## Tenant invitation UAT flow — 7 November 2026

- Migration `005_tenant_invitation.sql` adds PostgreSQL FORCE-RLS tenant-scoped invitations; 14 tenant-owned tables now require forced RLS in the readiness check.
- `POST /v1/tenants/invitations`: authenticated OWNER/ADMIN; ordinary users cannot invite. ADMIN may invite MEMBER only. A 32-byte unpredictable token is returned exactly once in UAT; only a SHA-256 digest is stored. Expires after 24 hours.
- `POST /v1/tenants/invitations/accept`: invitation redemption by the exact email, slug and unexpired token; transactional row lock makes redemption single-use. New users receive MEMBER or ADMIN membership only in the issuing tenant. Cross-tenant redemption and replay are rejected.
- `POST /v1/tenants/invitations/:id/revoke`: authorized owner/admin can revoke an unused invitation, leaving evidence in the audit log.
- All invitation routes **fail closed with HTTP 423 in NODE_ENV=production**; enabling UAT requires `OCEAN_INVITATIONS_UAT_ENABLED=true` in a nonproduction environment. No email is sent and the invite token must not be written to logs or external analytics.
- This is a **synthetic invitation UAT**, not real customer onboarding: production needs verified-email delivery, account linking or SSO, MFA, rate limiting, revocation UX, support recovery, and privacy review. Existing user emails are intentionally refused until a governed multi-tenant account-linking mechanism exists.

## TOTP MFA foundation — 8 November 2026

- Migration `006_mfa_totp.sql` adds `ocean_mfa_credentials` with FORCE RLS. All **15** tenant-owned tables must pass the runtime RLS preflight.
- `GET /v1/auth/mfa` reports enabled state for the signed-in member; `POST /v1/auth/mfa/enroll` and `POST /v1/auth/mfa/confirm` require a nonproduction UAT flag `OCEAN_MFA_UAT_ENABLED=true`.
- Enrollment requires reauthentication with the user's password and returns an `otpauth://` provisioning URI only to the authenticated UAT requester, never via logs or external providers. Enrollment expires after 10 minutes. TOTP secrets use AES-256-GCM with tenant/user-bound associated data and a separate 32-byte `OCEAN_MFA_KEY_HEX` from a secret manager.
- Confirmation consumes the submitted 30-second OTP and atomically records the accepted time-step, enables MFA, and revokes any other pre-MFA sessions. Future logins to the account require password **plus TOTP**; reused time-steps are denied and share the existing persistent account lockout policy.
- In `NODE_ENV=production`, all password-only logins without enrolled MFA are denied and TOTP enrollment is disabled. This is **deliberately not a production enrollment implementation**: a verified initial enrollment or enterprise SSO flow, customer support recovery, key rotation, rate limiting and customer security review must precede release.
