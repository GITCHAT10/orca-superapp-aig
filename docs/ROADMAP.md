# CTO Roadmap

## Phase 0 — Platform foundation
- Repository governance and CI
- Tenant model
- Identity/RBAC
- Postgres persistence
- Audit/evidence events
- Agent registry
- Workflow/approval engine
- Model/tool adapter interfaces
- Secrets management
- Observability
- Billing/metering skeleton
- UAT environment

Exit gate: two isolated tenants pass authorization, data-isolation, audit and rollback tests.

## Phase 1 — Public launch candidates
1. AIG WORK
2. AIG HOSPITALITY
3. AIG TRAVEL

Exit gate: authenticated end-to-end UAT with persistence and evidence for each product.

## Phase 2
- AIG FINANCE
- AIG STUDIO
- AIG ACADEMY

## Phase 3
- AIG PROJECTS
- AIG BOS
- AIG COMMERCE

## Phase 4
- AIG UTILITIES
- Enterprise private deployment options

## Engineering policy
External open-source systems are integrated behind adapters where useful. They are not merged wholesale into the platform unless a specific technical and licensing review approves it.
