# AIG CLOUD

Public multi-tenant SaaS platform for AIG Maldives.

## Product family
- AIG WORK
- AIG HOSPITALITY
- AIG TRAVEL
- AIG FINANCE
- AIG STUDIO
- AIG ACADEMY
- AIG PROJECTS
- AIG BOS
- AIG COMMERCE
- AIG UTILITIES

## Boundary
BRAIN CORAL is a separate private MIG-only system. AIG CLOUD must not depend on, expose, copy, or share BRAIN CORAL private data, memory, credentials, agents, evidence, or authority controls.

## Platform principles
1. Tenant isolation by default.
2. Least-privilege RBAC.
3. Human approval for consequential actions.
4. Evidence and audit for every external action.
5. Replaceable model/tool adapters.
6. No secrets in source control.
7. UAT before production promotion.
8. Reversible deployments and tested rollback.

See `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/SECURITY_BOUNDARY.md`, and `docs/UAT_RELEASE_GATES.md`.

## Executable SaaS control-plane foundation (PR #19)

The repository now also contains a Node 22 + Fastify + TypeScript backend under `src/`, PostgreSQL 16 schema migrations under `sql/`, and a real two-tenant HTTP/RLS integration suite under `tests/`.

**Implemented (tested in CI, not deployed to production):** scoped tenant registration (synthetic dev/UAT), password login with expiring/revocable opaque sessions, forced PostgreSQL RLS for tenant-owned records, module entitlements, trial subscription records, idempotent usage evidence, append-only audit records, maker/checker approval workflow and durable undelivered event outbox, disabled-by-default AI agent/model route catalog, disconnected product-adapter contracts, and 48 KiB max AES-256-GCM encrypted tenant-scoped object storage.

**Deliberate limitations:** activating a module does not deploy a separate product; recording usage does not invoice or charge; an approval does not execute external actions; registering a product adapter does not connect to BRAIN CORAL; drafting an AI route does not invoke a model. Production security hardening, independently managed storage keys, MFA/SSO, customer onboarding controls, rate limiting, reliable outbound delivery workers, third-party provider integrations, backup/restore and release approval remain mandatory.

- [Backend implementation and safety guide](docs/CONTROL_PLANE_MVP.md)
- [PostgreSQL two-tenant CI workflow](.github/workflows/ocean-control-plane.yml)
- Local setup requires isolated PostgreSQL 16 and a **non-owner**, non-BYPASSRLS application login distinct from migration ownership.
- `npm install` → `npm run build` → `npm run db:migrate` → `npm test` (requires CI-style test environment). Use synthetic credentials only.
