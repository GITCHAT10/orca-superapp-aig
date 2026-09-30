# UAT and Release Gates

Every release must produce evidence for these gates.

## G0 Build
- reproducible install/build
- locked dependencies
- no committed secrets
- migrations versioned

## G1 Automated tests
- unit tests
- integration tests
- tenant-isolation tests
- authorization tests
- idempotency tests for external actions

## G2 Security
- dependency scan
- secret scan
- static analysis
- authentication/authorization negative tests
- adapter credential scope review

## G3 Persistence
- clean database migration
- rollback or forward-repair procedure
- backup and restore test
- audit event persistence

## G4 UAT
- real authenticated user
- real tenant
- real workflow
- expected external side effect or sandbox equivalent
- evidence record linked to action
- failure and retry path verified

## G5 Release
- rollback rehearsed
- observability dashboards/alerts present
- release notes prepared
- explicit production approval by authorized AIG release owner

No gate may be marked passed without evidence.
