# API Conventions

## Identity and tenancy
- authenticated identity determines allowed tenant memberships
- tenant context must be resolved server-side
- never trust tenant_id supplied by a client without membership validation
- privileged cross-tenant support operations require explicit platform authorization and evidence

## Requests
- JSON over HTTPS
- request/correlation ID on every request
- idempotency key required for retriable state-changing external actions
- UTC timestamps in ISO 8601

## Responses
- stable machine-readable error codes
- no stack traces, secrets or provider credentials in public responses
- pagination required for unbounded collections

## Versioning
Use explicit versioned public API paths when compatibility cannot be maintained.

## Webhooks
- signed payloads
- replay protection
- idempotent consumers
- retry with bounded backoff
- evidence event for acceptance/failure

## Audit
Privileged/state-changing operations should record actor, tenant, action, resource, result, timestamp and correlation ID.
