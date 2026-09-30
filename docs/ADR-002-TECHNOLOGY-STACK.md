# ADR-002: AIG CLOUD technology stack

Status: Accepted for MVP foundation

## Goal
Use a conservative, portable SaaS stack that supports strict tenant isolation, auditable AI workflows and replaceable external providers.

## Application
- Language: TypeScript
- Runtime: Node.js LTS
- Web UI: React-based web application
- API style: REST/OpenAPI first; webhooks for asynchronous integrations
- Monorepo: workspace-based packages with shared contracts and test utilities

## Persistence
- Primary database: PostgreSQL 16+
- Tenant isolation: immutable tenant_id on tenant-owned rows plus PostgreSQL Row Level Security as defense in depth where practical
- Vector retrieval: pgvector initially to avoid a separate vector database
- Queue/cache: Redis-compatible service with durable job semantics
- Object storage: S3-compatible abstraction
- Secrets: cloud/external secret manager; database stores references only

## AI / agents
- Provider-neutral model router
- Replaceable model adapters
- Agent registry and workflow engine are AIG-owned platform capabilities
- Human approval can be required per action/workflow
- Every external side effect carries idempotency and evidence metadata

## Observability
- OpenTelemetry-compatible traces, metrics and logs
- Correlation IDs propagated across API, workflow, adapter and billing events
- Redaction required before logs leave application boundaries

## Billing
Provider-neutral billing interface. Plans, module entitlements, usage meters and billing events are AIG-owned records. A payment processor is an adapter, not the source of commercial truth.

## Deployment
Container-compatible and cloud-provider-neutral at the application layer. Managed PostgreSQL/object storage/secret manager are preferred for production.

## Rationale
This reduces infrastructure count during MVP while preserving future portability and enterprise deployment options.
