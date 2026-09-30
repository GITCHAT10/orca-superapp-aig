# External Adapter Contract

Each third-party integration is replaceable and must implement a normalized contract.

## Required lifecycle
authorize -> validate policy -> prepare request -> execute -> normalize result -> record evidence -> return outcome

## Required properties
- scoped credentials
- timeout/retry policy
- idempotency key for side effects
- correlation ID
- redacted structured logs
- explicit error classification
- health check
- feature flag / kill switch
- sandbox/UAT mode where available
- documented fallback and rollback

## Prohibited
Adapters must not receive BRAIN CORAL credentials, MIG-private memory, or unrestricted cross-tenant access.
