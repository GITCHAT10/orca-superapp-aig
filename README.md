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
