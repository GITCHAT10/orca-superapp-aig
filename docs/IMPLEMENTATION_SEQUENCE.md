# Platform Implementation Sequence

## Gate A — repository administration
Must be complete before proprietary implementation:
- private source repository
- protected main
- required CI checks
- authorized review requirement

## Gate B — platform kernel
1. workspace/monorepo scaffold
2. PostgreSQL connection and migration framework
3. Tenant, User, Membership, Role and Permission
4. authentication/session adapter
5. tenant-context middleware
6. RLS/tenant-isolation integration tests
7. EvidenceEvent append-only ledger
8. correlation/idempotency primitives
9. health/readiness endpoints
10. OpenTelemetry baseline

## Gate C — agent/workflow kernel
1. AgentDefinition
2. Tool/Adapter registry
3. WorkflowDefinition / WorkflowRun
4. ApprovalRequest
5. model-router interface
6. sandbox/kill-switch policy
7. evidence linkage for tool calls

## Gate D — commercial kernel
1. Subscription
2. ModuleEntitlement
3. UsageMeter
4. BillingEvent
5. price-book versioning
6. performance-baseline records

## Gate E — first public products
1. AIG WORK
2. AIG HOSPITALITY
3. AIG TRAVEL

No later gate bypasses earlier security/UAT gates.
