# Tenancy Model

## Principle
Every customer organization is a tenant. Every persistent business record must carry an immutable tenant scope.

## Required rules
1. tenant_id is derived from authenticated context, never trusted from arbitrary client input.
2. service-layer authorization checks tenant membership and role before access.
3. queries must be tenant-filtered by construction.
4. background jobs inherit explicit tenant context.
5. caches, vector indexes, files, secrets and usage meters are tenant-partitioned.
6. audit events include tenant_id, actor_id, action, resource, result and correlation_id.
7. cross-tenant admin actions require explicit platform-authority workflow and evidence.

## UAT
Two independent tenants must be created and tested for:
- positive access within tenant
- negative access across tenants
- file/object isolation
- memory/vector isolation
- audit isolation
- billing isolation
