# AGENTS.md

## Scope
This repository is AIG CLOUD, the public SaaS program.

## Mandatory rules
- Do not import or expose BRAIN CORAL private code, data, prompts, memory, credentials, evidence, or internal authority configuration.
- Prefer adapters over vendoring or wholesale merging of external projects.
- All persistent records must be tenant-scoped.
- All privileged actions must be authorized and auditable.
- Never commit credentials or production customer data.
- Add tenant-isolation and authorization tests when adding endpoints.
- External side effects require idempotency and evidence events.
- Keep migrations recoverable and document rollback/forward-repair.
- Production promotion requires UAT evidence.

## Initial build order
platform core -> AIG WORK -> AIG HOSPITALITY -> AIG TRAVEL.
