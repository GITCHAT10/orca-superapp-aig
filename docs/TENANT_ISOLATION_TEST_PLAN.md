# Tenant Isolation Test Plan

Create Tenant A and Tenant B with distinct users, roles, files, memory records, workflows, billing events and adapter connections.

Required negative tests:
- Tenant A user cannot fetch/update/delete Tenant B records by guessed ID
- Tenant A cannot list Tenant B resources
- Tenant A background job cannot execute with Tenant B context
- Tenant A file URL/token cannot retrieve Tenant B object
- Tenant A memory/vector query cannot return Tenant B content
- Tenant A usage/billing query cannot return Tenant B events
- Tenant A adapter connection cannot be selected by Tenant B
- cache keys do not collide across tenants

Required positive tests:
- authorized user can perform permitted actions inside own tenant
- role changes take effect predictably
- evidence events record correct tenant and actor
- platform-authorized support action is explicitly evidenced

Release blocker:
Any cross-tenant leakage fails the release.
