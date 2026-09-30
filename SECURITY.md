# Security Policy

## Scope
AIG CLOUD is a public SaaS platform. BRAIN CORAL remains a separate MIG-only security domain.

## Never commit
- production credentials or API keys
- customer data
- MIG/BRAIN CORAL private data, prompts, memory, evidence, or credentials
- private infrastructure addresses or recovery secrets

## Baseline
- least privilege
- tenant-scoped authorization
- short-lived adapter credentials
- encryption in transit and at rest
- append-only audit evidence for privileged actions
- dependency/secret/static analysis in CI
- backup/restore and rollback verification before production

## Vulnerability handling
Do not publish exploitable details in a public issue. Record the finding privately with the authorized repository owner and remediate before disclosure.
