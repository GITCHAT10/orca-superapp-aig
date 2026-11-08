# AIG Robotics & Buildings — Safe Foundation
Status: **draft / simulation-only**. NO hardware controls, digital keys, or robot dispatch commands are activated.

## Audit of the submitted NEXTGEN design
- PR #19 in `orca-superapp-aig` uses Fastify + pg + Zod + Node test runner, not the pasted Prisma/Jest scaffold. Keep BRAIN CORAL isolated.
- Do NOT trust `tenantId`, `propertyId`, robot identity, user role or deposit confirmation supplied by HTTP clients. Resolve from authenticated tenant/user/device context and authoritative property/booking/payment services.
- 6 decimal GPS degrees is not centimetre accuracy; indoor robots need a validated localization map frame with uncertainty (metres) and vendor safety controls.
- An event saying `digitalKeyIssued: true` is NOT evidence that a smart lock accepted a real credential. Require device acknowledgement, approved stay, access scope and revocation.
- Do not use `setImmediate` for durable robot task delivery or fire-and-forget commands. Persist intent and idempotent outbox record in the same database transaction; dispatch via a durable worker only after independent safety and authorization gates.
- Never let a database trigger physically halt, resume, or move robots. A software HOLD is distinct from a certified robot-side emergency stop.
- A telemetry write must use independently authenticated robot identity (mTLS or vendor-signed device credentials), replay/sequence checking, bounded payload, timestamp sanity, property-scoped authorization, rate limit, and retention period.
- Incident escalation requires deduplication, human acknowledgement, lease/backoff and operator takeover. Do not endlessly retry unsafe navigation.
- FORCE RLS and tenant/property composite references must cover tasks, incidents, telemetry and outbox; actor permissions must be independently scoped.

## Proposed physical-domain tables (review before migration)
- `ocean_robot_fleet`: tenant_id, property_id, robot_id, vendor_adapter_id, state, battery, last_seen, safety_hold. Composite unique scope.
- `ocean_robot_tasks`: task_id, tenant_id, property_id, robot_id, revision, state, retry_count, next_retry_at, lease_owner, expiry, request_idempotency_key.
- `ocean_robot_incidents`: tenant/property/task, deterministic incident key, severity, sanitized error summary, operator status and event trail.
- `ocean_robot_telemetry`: authenticated robot, monotonically increasing sequence, received_at, sampled_at, battery, signal, location_frame, x_m, y_m, accuracy_m. Partition and retention policy; avoid raw personal tracking.
- `ocean_robot_outbox`: scoped task state transition and sequence, immutable payload digest, idempotency key, dispatch lease, attempts, acknowledgement and error.
- `ocean_iot_devices`, `ocean_digital_credentials`: separate privileged lock domain with cryptographic revocation and hardware acknowledgement.

## Required integration tests before deployment
1. Real verified tenant/operator/device authentication; wrong-tenant or wrong-property IDs rejected even with valid sessions.
2. PostgreSQL FORCE RLS and composite FKs; no tenant bypass by app DB role, background worker or direct query.
3. Concurrent state transitions; exactly-once business intent via idempotent task version/outbox, at-least-once delivery handling.
4. Network loss before/after hardware acknowledgement does not reissue a movement command unsafely.
5. Robot blocked/offline, stale location, weak battery, excessive retries → safe hold, human intervention; physical e-stop tested independently with vendor.
6. Smart lock credentials checked against actual room/stay/person, expiration and revocation; negative cross-room trials.
7. Guest check-in and payments confirmed by authoritative PMS/payment adapter before acknowledging completion.
8. Privacy, telemetry retention, evidence chain, backup/recovery and staff UAT.

## Release boundary
No SQL schema deployed. No database state, device, physical room or guest stay mutated. No production credentials. Local policy test is a pure function and is NOT a substitute for integration, security, safety or physical acceptance tests.

Next: build dedicated migration and explicit Fastify endpoints in a reviewed follow-up PR with vendor-neutral device identity, scoped RLS and event outbox, behind disabled feature flags.
