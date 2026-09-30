# ADR-001: AIG CLOUD and BRAIN CORAL are separate systems

Status: Accepted

## Decision
AIG CLOUD is the public commercial multi-tenant SaaS platform.
BRAIN CORAL is the private MIG-only sovereign operating system.

## Consequences
- no shared production database
- no shared secrets store
- no shared customer-accessible API surface
- no automatic memory replication
- no shared agent identities
- no public dependency on BRAIN CORAL availability
- reusable ideas/components require explicit review before reimplementation in AIG CLOUD

This boundary is a release invariant.
