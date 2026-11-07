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
