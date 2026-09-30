# Secure SDLC

## Design
- identify tenant/security impact
- update ADR/threat model when architecture changes
- define rollback/forward-repair before irreversible migrations

## Build
- no secrets in source
- tenant-scoped persistence
- authorization at service boundaries
- idempotency for retriable side effects
- structured redacted logs

## Test
- unit tests
- integration tests
- negative authorization tests
- tenant-isolation tests
- migration tests
- adapter failure/retry tests
- billing/evidence integrity tests where applicable

## Review
- pull request
- CODEOWNERS/reviewer
- CI checks
- security checklist

## UAT
- authenticated users
- isolated test tenants
- real workflow path
- evidence captured
- failure/retry and rollback verified

## Release
- immutable version
- approved migration
- monitoring/alerts
- authorized production approval
- post-release verification
