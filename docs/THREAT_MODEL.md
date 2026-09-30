# AIG CLOUD Threat Model

## Primary assets
- tenant data and files
- identities and sessions
- secrets and adapter credentials
- billing and entitlement records
- workflow/approval state
- evidence/audit events
- AI prompts/context assembled from tenant data

## Main threats
1. cross-tenant data access
2. broken authorization / privilege escalation
3. secret leakage
4. prompt/tool injection causing unsafe external actions
5. replay/duplicate external side effects
6. compromised third-party adapter
7. insecure webhook ingestion
8. malicious file/content ingestion
9. audit/evidence tampering
10. billing/usage manipulation
11. supply-chain dependency compromise
12. denial of service / resource abuse

## Mandatory controls
- server-side tenant context and deny-by-default RBAC
- RLS/tenant filtering defense in depth
- scoped/short-lived credentials
- approval gates for consequential actions
- adapter allowlists, kill switches and idempotency keys
- signed/replay-protected webhooks
- content/file validation and sandboxing
- append-only audit/evidence semantics
- rate limits, quotas and abuse detection
- dependency/secret scanning
- backup/restore and incident runbooks

## Release rule
A known path to cross-tenant disclosure, unauthorized privileged action, secret exposure or unaudited consequential side effect blocks production release.
