# Contributing to AIG CLOUD

## Change flow
1. Work on a branch.
2. Open a pull request.
3. Complete the security/tenancy checklist.
4. Require CI to pass.
5. Add UAT evidence for behavior affecting customers or external systems.
6. Do not promote to production without authorized release approval.

## Architecture rules
- BRAIN CORAL remains outside this repository and outside the AIG CLOUD customer trust boundary.
- Prefer replaceable adapters for external engines and services.
- All persistent business data is tenant scoped.
- External side effects must be idempotent and auditable.
- Secrets are references, not plaintext database values.

## Definition of done
A change is not done until tests, migration/recovery notes, observability impact, security impact and rollback/forward-repair are addressed.
