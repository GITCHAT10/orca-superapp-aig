# Incident Response

## Severity examples
SEV-1: confirmed cross-tenant disclosure, credential compromise, destructive unauthorized action, material billing/security integrity failure.
SEV-2: major tenant outage or high-risk vulnerability without confirmed exploitation.
SEV-3: limited degradation or lower-risk defect.

## Immediate actions
1. preserve evidence and correlation IDs
2. stop/disable affected adapter or workflow when safe
3. rotate/revoke exposed credentials
4. isolate affected tenant/service
5. identify scope and customer impact
6. restore service from known-good state where appropriate
7. document decisions and timestamps

## Post-incident
- root-cause analysis
- corrective tests
- control update
- restore/rollback validation
- customer/regulatory notification assessment by authorized human/legal owner

Do not delete logs/evidence needed for investigation.
