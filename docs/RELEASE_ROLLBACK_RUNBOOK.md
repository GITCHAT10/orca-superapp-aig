# Release and Rollback Runbook

## Before release
- identify immutable release version
- confirm required CI checks
- confirm migration plan
- confirm backup/restore evidence
- confirm UAT evidence
- confirm observability and alerting
- confirm feature flags/kill switches for new external adapters
- obtain authorized production approval

## Release
1. deploy application version
2. apply approved migrations
3. run smoke checks
4. verify authentication and tenant isolation
5. verify evidence/audit stream
6. verify billing/metering signals where affected
7. record release evidence

## Rollback / forward repair
- application-only regression: redeploy previous immutable version
- schema change: use documented backward-compatible rollback or forward-repair path
- external adapter issue: disable adapter via kill switch and preserve queued work
- tenant-impacting incident: isolate affected tenant/workflow and preserve evidence

## Post-release
- observe error/latency/security signals
- verify critical workflows
- record release outcome
- open incident if any gate assumption fails
