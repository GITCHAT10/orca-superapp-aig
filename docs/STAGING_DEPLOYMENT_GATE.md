# OCEAN CLOUD — Staging Deployment Gate

**Status:** PREPARED, NOT PROVISIONED OR DEPLOYED. Production is NOT authorized.

This staging image is isolated from the private MIG BRAIN CORAL network and storage. Do not configure any BRAIN CORAL token, database URL, employee account or private workspace secret.

## Requirements before any external staging deployment

1. Owner approves an isolated **staging-only** Render project or equivalent, with **a separate** PostgreSQL 16 database (not an existing MIG service DB). Do not expose database public network access unless narrowly scoped and approved.
2. Provision a migration owner and a separate runtime `ocean_app` role. The runtime role must have `rolsuper=false`, `rolbypassrls=false`, and must NOT own `ocean_sessions` or any tenant table.
3. Store generated private credentials in the platform secret manager, never in GitHub, CI logs, web pages, or docs.
4. Configure `OCEAN_DATABASE_URL` and `OCEAN_STORAGE_KEY_HEX` (fresh 32-byte hex key from a secure generator) for the runtime. `OCEAN_MIGRATION_DATABASE_URL` is **migration job only**, never present in runtime.
5. Set `NODE_ENV=production`, `OCEAN_SIGNUP_ENABLED=false` to block self-registration. There is no approved external customer onboarding yet; that is intentional.
6. Apply versioned SQL 001–004 through a controlled migrator under the migration owner before starting the app. Verify transactional backups, schema role ownership and restoration procedures.
7. Use `Dockerfile` to build the isolated runtime image. Expose only HTTPS through a managed reverse proxy, keep direct container port private, and use `/readyz` as the readiness gate. Readiness requires an available DB, restricted runtime role, all 14 tenant tables with FORCE RLS, a storage key, and registration closed in production.
8. Test separate tenant sessions with synthetic data only; do not connect external billing, mail delivery, live AI, or AIG business backends.
9. Record CI SHA, RLS test evidence, approval, rollback plan, and change window before any deployment.

## Blockers and guardrails

- No authorized live staging database/service created in this PR.
- Registration uses dev/UAT-only self-service and is disabled in production-mode staging. A secure invitation/identity bootstrap is required before real tenant onboarding.
- Account lockout is implemented but NOT a distributed or network-level rate limiter. Add reverse-proxy/WAF request limits and production MFA/SSO before public customer access.
- The initial object store is limited to 48 KiB objects inside PostgreSQL with AES-256-GCM. This is NOT DEEP, not replicated object storage, and not proven restore capability.
- Existing product adapters are disconnected. The public SaaS must not query private BRAIN CORAL production services or data.
- No automatic schema migration from application startup; runtime identity cannot have migration privileges.

## Rollback

Keep prior immutable image digest, take a verified pre-deploy encrypted DB snapshot, use backwards-compatible migrations, and switch the service back to a known image if the security/readiness checks fail. Any persistent schema rollback needs a tested forward-repair strategy approved by the DBA.

## Invitation gate

Self-registration remains disabled in production and the new `/v1/tenants/invitations` workflow is disabled in production as well. Staging UAT may explicitly enable it with synthetic users; invitation secrets are returned only once and never sent to a live mailbox. Do not onboard real customers before a verified-email/SSO identity bridge, MFA and approved delivery integration exist.
