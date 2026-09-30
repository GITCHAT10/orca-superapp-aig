# Data Classification

## Public
Approved marketing, public product documentation, public API documentation.

## Internal
Non-public operating procedures, architecture notes, non-sensitive test data, internal roadmaps.

## Confidential
Customer business data, contracts, pricing terms, tenant configuration, non-public analytics, support records.

## Restricted
Credentials, secrets, private keys, authentication tokens, payment-sensitive data, regulated personal data, security incident evidence, production backups.

## Rules
- Public repositories may contain Public data only.
- Internal/Confidential/Restricted data must not be committed to a public repository.
- Restricted data must use an approved secret/data store and least-privilege access.
- Logs must redact Restricted data and minimize Confidential data.
- Test fixtures use synthetic data unless explicitly approved.
- Data exports and deletions must be tenant-scoped and auditable.

BRAIN CORAL/MIG private memory, evidence, credentials and operational records are outside the AIG CLOUD customer/data domain and must never be copied into public SaaS fixtures.
