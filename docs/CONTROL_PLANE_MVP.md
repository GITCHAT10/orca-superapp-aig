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

## Real isolation properties

Every authenticated request MUST provide a valid bearer session plus `x-ocean-tenant` slug. Server resolves tenant id and validates an active session scoped to that id. The tenant id comes from server-side tenant lookup and session, not request body. Row-level security is ENABLED and FORCEd for membership, session, entitlement, subscription, usage and audit tables. Tenant-scoped SQL always runs in a PostgreSQL transaction with `SET LOCAL app.tenant_id` before queries. The web service **MUST** run under a restricted non-owner `ocean_app` database role without BYPASSRLS and separately from the schema migration role.

Never treat OCEAN CLOUD as a privileged BRAIN CORAL client. No private MIG data, service secrets or credentials belong here.

## UAT bootstrap (do not use real clients or passwords)

1. Provision isolated PostgreSQL 16 and a non-owner `ocean_app` login with its own random secret. DO NOT reuse MIG database.
2. Configure `OCEAN_MIGRATION_DATABASE_URL` with distinct migration owner credentials and `OCEAN_DATABASE_URL` with non-owner role.
3. `npm install`, `npm run db:migrate`, `npm run build`, `npm test`.
4. `OCEAN_SIGNUP_ENABLED=true npm run dev` only in dev/UAT. Production self-registration is hard-disabled even if env is true.
5. Use two separate synthetic tenants and owner email addresses. Call login, module activation and audit API with each tenant's own bearer session.

## What is NOT implemented

No BRAIN CORAL private access, actual vertical provisioning, AI orchestration, external payment provider, outbound mail, subscription invoicing, file/object storage, password reset, MFA, rate limits at edge, enterprise SSO, qualified security audit, operational incident monitoring or production deployment. Module activation writes a database entitlement and audit entry but explicitly returns `provisioned:false`. Do not advertise complete product availability.

## Required release gates

Implement registration invitation/verification, origin/CORS constraints, production session rate limiting, MFA/SSO, secure secret management, signed adapters, persistent workflow approvals, recoverable backups, fuller operational observability, CI dependency security scan, and explicit infrastructure/operator authorization. No production migration or deploy from this branch.

Documentation and static marketplace content retained.
