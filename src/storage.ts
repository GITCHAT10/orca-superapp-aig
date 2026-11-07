import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import { withTenant } from "./db.js";

const objectInput=z.object({
  objectName:z.string().min(1).max(180),
  base64Content:z.string().min(1).max(65536).regex(/^[A-Za-z0-9+/]*={0,2}$/),
}).strict();
const routeInput=z.object({
  provider:z.enum(["OPENAI","ANTHROPIC","OTHER"]),
  modelId:z.string().min(2).max(100).regex(/^[A-Za-z0-9._:/-]+$/),
}).strict();
function encryptionKey():Buffer {
  const hex=process.env.OCEAN_STORAGE_KEY_HEX??"";
  if(!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error("Encryption key not configured");
  return Buffer.from(hex,"hex");
}
const aad=(tenantId:string,id:string)=>Buffer.from("OCEAN:"+tenantId+":"+id,"utf8");

export async function registerOceanStorageRoutes(app:FastifyInstance,pool:Pool) {
  app.post("/v1/objects",async(request,reply)=>{
    const p=request.oceanPrincipal!;
    let key:Buffer;
    try {key=encryptionKey();} catch{return reply.code(503).send({error:"Object storage not configured"});}
    const input=objectInput.parse(request.body);
    const plaintext=Buffer.from(input.base64Content,"base64");
    if(plaintext.length===0||plaintext.length>48*1024)return reply.code(413).send({error:"MVP object size limit 48 KiB"});
    const id=randomUUID(),iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",key,iv);
    cipher.setAAD(aad(p.tenantId,id));
    const ciphertext=Buffer.concat([cipher.update(plaintext),cipher.final()]);
    const tag=cipher.getAuthTag(),sha256=createHash("sha256").update(plaintext).digest("hex");
    return withTenant(pool,p.tenantId,async client=>{
      await client.query(
        "INSERT INTO ocean_objects(id,tenant_id,object_name,ciphertext,nonce,auth_tag,sha256,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [id,p.tenantId,input.objectName,ciphertext,iv,tag,sha256,p.userId],
      );
      await client.query(
        "INSERT INTO ocean_audit_events(tenant_id,actor_id,action,resource) VALUES($1,$2,'OBJECT_STORED',$3)",
        [p.tenantId,p.userId,id],
      );
      return reply.code(201).send({id,sha256,sizeBytes:plaintext.length,encrypted:true,replicated:false});
    });
  });
  app.get("/v1/objects/:id",async(request,reply)=>{
    const p=request.oceanPrincipal!;
    let key:Buffer;
    try{key=encryptionKey();}catch{return reply.code(503).send({error:"Object storage not configured"});}
    const {id}=z.object({id:z.uuid()}).parse(request.params);
    return withTenant(pool,p.tenantId,async client=>{
      const result=await client.query<{object_name:string;ciphertext:Buffer;nonce:Buffer;auth_tag:Buffer;sha256:string}>(
        "SELECT object_name,ciphertext,nonce,auth_tag,sha256 FROM ocean_objects WHERE id=$1 AND tenant_id=$2",
        [id,p.tenantId],
      );
      const obj=result.rows[0];
      if(!obj)return reply.code(404).send({error:"Object not found"});
      // Authentication fails if ciphertext, tenant binding, object id or tag changed.
      const decipher=createDecipheriv("aes-256-gcm",key,obj.nonce);
      decipher.setAAD(aad(p.tenantId,id));
      decipher.setAuthTag(obj.auth_tag);
      const plaintext=Buffer.concat([decipher.update(obj.ciphertext),decipher.final()]);
      if(createHash("sha256").update(plaintext).digest("hex")!==obj.sha256){
        return reply.code(500).send({error:"Object integrity verification failed"});
      }
      return {id,objectName:obj.object_name,base64Content:plaintext.toString("base64"),sha256:obj.sha256};
    });
  });
  app.put("/v1/agents/:key/model-route",async(request,reply)=>{
    const p=request.oceanPrincipal!;
    if(p.role!=="OWNER"&&p.role!=="ADMIN")return reply.code(403).send({error:"Admin role required"});
    const {key}=z.object({key:z.string().regex(/^[a-z0-9][a-z0-9-]{2,62}$/)}).parse(request.params);
    const input=routeInput.parse(request.body);
    return withTenant(pool,p.tenantId,async client=>{
      const hasAgent=await client.query("SELECT 1 FROM ocean_agent_registry WHERE tenant_id=$1 AND agent_key=$2",[p.tenantId,key]);
      if(!hasAgent.rowCount)return reply.code(404).send({error:"Agent not registered"});
      await client.query(
        "INSERT INTO ocean_model_routes(tenant_id,agent_key,provider,model_id,updated_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(tenant_id,agent_key) DO UPDATE SET provider=EXCLUDED.provider,model_id=EXCLUDED.model_id,updated_by=EXCLUDED.updated_by,updated_at=now()",
        [p.tenantId,key,input.provider,input.modelId,p.userId],
      );
      await client.query(
        "INSERT INTO ocean_audit_events(tenant_id,actor_id,action,resource) VALUES($1,$2,'MODEL_ROUTE_DRAFTED',$3)",
        [p.tenantId,p.userId,key],
      );
      return {agentKey:key,provider:input.provider,modelId:input.modelId,enabled:false,executed:false};
    });
  });
  app.get("/v1/agents/model-routes",async request=>{
    const p=request.oceanPrincipal!;
    return withTenant(pool,p.tenantId,async client=>{
      const r=await client.query(
        "SELECT agent_key,provider,model_id,enabled FROM ocean_model_routes WHERE tenant_id=$1 ORDER BY agent_key",
        [p.tenantId],
      );
      return {routes:r.rows,providerRequestsEnabled:false};
    });
  });
}
