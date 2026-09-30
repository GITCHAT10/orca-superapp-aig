# Environments

## Development
Synthetic data only. No production credentials.

## UAT
Dedicated tenant-isolated environment for authenticated acceptance testing.
Requirements:
- separate database or strongly isolated UAT database
- non-production adapter credentials
- synthetic or explicitly approved test data
- evidence retention for each UAT run
- deterministic reset/reseed procedure

## Production
Production credentials, customer data and billing are permitted only after release gates pass.

## Promotion
development -> CI -> staging/UAT -> acceptance evidence -> production approval -> controlled release -> post-release verification

No environment may use BRAIN CORAL private databases, credentials, memory stores or agent identities.
