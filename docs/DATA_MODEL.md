# Initial Platform Data Model

Core entities:
- Tenant
- User
- Membership
- Role
- Permission
- AgentDefinition
- WorkflowDefinition
- WorkflowRun
- ApprovalRequest
- EvidenceEvent
- AdapterConnection
- SecretReference
- UsageMeter
- Subscription
- ModuleEntitlement
- PriceBook
- BillingEvent
- PerformanceBaseline
- PerformanceMeasurement
- FileObject
- MemoryNamespace

## Design constraints
- tenant-scoped unique indexes where relevant
- append-only evidence and billing events
- immutable IDs
- timestamps in UTC
- explicit soft-delete/retention policy
- no plaintext secrets in relational tables
