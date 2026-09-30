# Security Boundary

## Non-negotiable separation
AIG CLOUD and BRAIN CORAL are separate security domains.

Prohibited:
- shared production database
- shared secrets
- shared tenant memory
- shared customer-accessible APIs
- implicit cross-system service accounts
- public access to MIG-only agents or evidence
- copying private MIG operational data into SaaS fixtures

## SaaS baseline
- Tenant-scoped authorization on every request
- Deny-by-default service permissions
- Short-lived credentials for adapters
- Encryption in transit and at rest
- Append-only audit events for privileged actions
- Rate limits and abuse controls
- Dependency and secret scanning in CI
- Backup/restore testing
- Security incident runbook
- Data export/deletion workflows
- Region and retention controls prepared for enterprise plans

## Release rule
A feature that cannot demonstrate tenant isolation, authentication, auditability and rollback does not ship to production.
