import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import { withTenant } from "./db.js";

// Contracts point to existing AIG product owners; no customer tenant gets
// BRAIN CORAL private database access or a network adapter by registration.
export const PRODUCT_CONTRACTS = Object.freeze([
  {key:"MAC_EOS_HOSPITALITY",owner:"HMS/SALA",protocol:"VERSIONED_HTTPS_API"},
  {key:"AIG_RETAIL_EOS",owner:"COCO BEACH/EPICURE",protocol:"VERSIONED_HTTPS_API"},
  {key:"UNITED_TRANSPORT",owner:"PAVANA",protocol:"VERSIONED_HTTPS_API"},
  {key:"MAAGILI_OS",owner:"MAAGILI TRADE",protocol:"VERSIONED_HTTPS_API"},
  {key:"PRESTIGIO",owner:"AEGIS identity federation",protocol:"SIGNED_IDENTITY_BRIDGE"},
  {key:"NEXAMA_HEALTHCARE",owner:"CLINICAL - restricted",protocol:"NON_CLINICAL_AGGREGATES_ONLY"},
  {key:"PRESTIGE_HOLIDAYS_OS",owner:"PRESTIGE DMC",protocol:"VERSIONED_HTTPS_API"},
  {key:"SKYFARM_OS",owner:"SKYFARM",protocol:"VERSIONED_HTTPS_API"},
  {key:"AIG_MAILMAN",owner:"MAILMAN",protocol:"SIGNED_APPROVED_METADATA_ONLY"},
  {key:"OCEAN_CLOUD",owner:"OCEAN CLOUD (self)",protocol:"NO_PRIVATE_BRAIN_CORAL_CONNECTION"},
  {key:"DEEP",owner:"DEEP STORAGE (not deployed)",protocol:"FUTURE_ENCRYPTED_OBJECT_STORAGE"},
]);

const approvalRequest = z.object({
  actionKey: z.enum(["CONNECT_PRODUCT","ENABLE_AI_AGENT","EXPORT_DATA"]),
  resourceKey: z.string().min(3).max(100).regex(/^[A-Za-z0-9._:-]+$/),
}).strict();
const decisionBody = z.object({ decision:z.enum(["APPROVED","REJECTED"]) }).strict();
const agentSchema = z.object({
  agentKey:z.string().regex(/^[a-z0-9][a-z0-9-]{2,62}$/),
  description:z.string().max(500),
}).strict();
function isAdmin(role?:string) {return role==="OWNER"||role==="ADMIN";}

export async function registerExtendedRoutes(app:FastifyInstance,pool:Pool){
  app.get("/v1/product-contracts",async request=>({
    contracts:PRODUCT_CONTRACTS.map(c=>({...c,connected:false,authorization:"NOT_CONFIGURED"})),
    tenantId:request.oceanPrincipal!.tenantId,
    privateBrainCoralAccess:false,
  }));

  app.post("/v1/workflows/approvals",async (request,reply)=>{
    const p=request.oceanPrincipal!;
    if(!isAdmin(p.role))return reply.code(403).send({error:"Admin role required"});
    const body=approvalRequest.parse(request.body);
    return withTenant(pool,p.tenantId,async client=>{
      const r=await client.query<{id:string}>(
        "INSERT INTO ocean_approval_requests(tenant_id,requested_by,action_key,resource_key) VALUES($1,$2,$3,$4) RETURNING id",
        [p.tenantId,p.userId,body.actionKey,body.resourceKey],
      );
      await client.query(
        "INSERT INTO ocean_audit_events(tenant_id,actor_id,action,resource) VALUES($1,$2,'APPROVAL_REQUESTED',$3)",
        [p.tenantId,p.userId,r.rows[0]!.id],
      );
      return reply.code(201).send({id:r.rows[0]!.id,status:"PENDING",executed:false});
    });
  });

  app.get("/v1/workflows/approvals",async (request,reply)=>{
    const p=request.oceanPrincipal!;
    if(!isAdmin(p.role))return reply.code(403).send({error:"Admin role required"});
    return withTenant(pool,p.tenantId,async client=>{
      const result=await client.query(
        "SELECT id,action_key,resource_key,status,created_at,decided_at FROM ocean_approval_requests WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 100",
        [p.tenantId],
      );
      return {requests:result.rows};
    });
  });

  app.post("/v1/workflows/approvals/:id/decision",async (request,reply)=>{
    const p=request.oceanPrincipal!;
    if(!isAdmin(p.role))return reply.code(403).send({error:"Admin role required"});
    const {id}=z.object({id:z.uuid()}).parse(request.params);
    const {decision}=decisionBody.parse(request.body);
    return withTenant(pool,p.tenantId,async client=>{
      // Atomic maker/checker; no self-approval and no double decision.
      const result=await client.query<{id:string}>(
        "UPDATE ocean_approval_requests SET status=$1,decided_by=$2,decided_at=now() WHERE id=$3 AND tenant_id=$4 AND status='PENDING' AND requested_by<>$2 RETURNING id",
        [decision,p.userId,id,p.tenantId],
      );
      if(!result.rows[0])return reply.code(409).send({error:"Not found, already decided or maker/checker violation"});
      await client.query(
        "INSERT INTO ocean_event_outbox(tenant_id,event_type,resource_id,payload) VALUES($1,'APPROVAL_DECIDED',$2,$3::jsonb)",
        [p.tenantId,id,JSON.stringify({decision})],
      );
      await client.query(
        "INSERT INTO ocean_audit_events(tenant_id,actor_id,action,resource) VALUES($1,$2,'APPROVAL_DECIDED',$3)",
        [p.tenantId,p.userId,id],
      );
      return {id,status:decision,executed:false,eventDelivery:"PENDING"};
    });
  });

  app.get("/v1/agents",async request=>{
    const p=request.oceanPrincipal!;
    return withTenant(pool,p.tenantId,async client=>{
      const result=await client.query(
        "SELECT agent_key,description,enabled,created_at FROM ocean_agent_registry WHERE tenant_id=$1 ORDER BY agent_key",
        [p.tenantId],
      );
      return {agents:result.rows,modelExecutionEnabled:false};
    });
  });

  app.post("/v1/agents",async (request,reply)=>{
    const p=request.oceanPrincipal!;
    if(!isAdmin(p.role))return reply.code(403).send({error:"Admin role required"});
    const body=agentSchema.parse(request.body);
    return withTenant(pool,p.tenantId,async client=>{
      await client.query(
        "INSERT INTO ocean_agent_registry(tenant_id,agent_key,description,created_by) VALUES($1,$2,$3,$4)",
        [p.tenantId,body.agentKey,body.description,p.userId],
      );
      await client.query(
        "INSERT INTO ocean_audit_events(tenant_id,actor_id,action,resource) VALUES($1,$2,'AGENT_REGISTERED',$3)",
        [p.tenantId,p.userId,body.agentKey],
      );
      return reply.code(201).send({agentKey:body.agentKey,enabled:false,modelProviderConnected:false});
    });
  });

  app.post("/v1/product-contracts/:key/register",async (request,reply)=>{
    const p=request.oceanPrincipal!;
    if(!isAdmin(p.role))return reply.code(403).send({error:"Admin role required"});
    const {key}=z.object({key:z.string().min(2).max(64)}).parse(request.params);
    if(!PRODUCT_CONTRACTS.some(c=>c.key===key))return reply.code(404).send({error:"Unknown product contract"});
    if(key==="OCEAN_CLOUD"||key==="NEXAMA_HEALTHCARE")return reply.code(403).send({error:"Restricted product contract cannot be registered by a customer"});
    return withTenant(pool,p.tenantId,async client=>{
      await client.query(
        "INSERT INTO ocean_product_adapters(tenant_id,adapter_key,created_by) VALUES($1,$2,$3) ON CONFLICT(tenant_id,adapter_key) DO NOTHING",
        [p.tenantId,key,p.userId],
      );
      await client.query(
        "INSERT INTO ocean_audit_events(tenant_id,actor_id,action,resource) VALUES($1,$2,'ADAPTER_REGISTERED',$3)",
        [p.tenantId,p.userId,key],
      );
      return reply.code(201).send({adapterKey:key,status:"DISCONNECTED",brainCoralDataAccess:false});
    });
  });
  app.get("/v1/outbox",async (request,reply)=>{
    const p=request.oceanPrincipal!;
    if(!isAdmin(p.role))return reply.code(403).send({error:"Admin role required"});
    return withTenant(pool,p.tenantId,async client=>{
      const x=await client.query(
        "SELECT id,event_type,resource_id,status,created_at FROM ocean_event_outbox WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 100",
        [p.tenantId],
      );
      return {events:x.rows,dispatcherEnabled:false};
    });
  });
}
