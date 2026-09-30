# AIG CLOUD Reference Architecture

## Control plane
AIG CLOUD is the public commercial SaaS control plane.

Core services:
- Tenant and organization service
- Identity, SSO and RBAC
- Agent registry
- Workflow and approval engine
- Tenant memory
- Evidence/audit ledger
- API/MCP integration gateway
- Model router
- Billing and usage metering
- Notifications
- Observability
- Secrets broker
- File/object storage abstraction

## Data plane
Each tenant receives isolated logical data boundaries for users, roles, agents, memory, files, secrets, workflows, audit events and usage.

## Vertical applications
AIG WORK is the horizontal shell. Vertical modules plug into the same control plane:
Hospitality, Travel, Finance, Studio, Academy, Projects, BOS, Commerce and Utilities.

## Adapter contract
Every external integration follows:

request -> authorization -> policy check -> adapter -> external service -> normalized result -> evidence event -> user-visible outcome

Consequential actions additionally require an approval gate when configured.

## BRAIN CORAL separation
BRAIN CORAL is not a runtime dependency of AIG CLOUD. No shared production database, secrets store, memory index, agent identity, tenant identifier, evidence stream, or customer-accessible network path is permitted.
