import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { withTenant } from "./db.js";
import { hashPassword, verifyPassword, newSessionToken, tokenDigest } from "./password.js";
import { registerExtendedRoutes } from "./extended.js";
import { registerOceanStorageRoutes } from "./storage.js";

type MemberRole = "OWNER" | "ADMIN" | "MEMBER";
type Principal = { tenantId: string; userId: string; role: MemberRole; sessionId: string };
declare module "fastify" {
  interface FastifyRequest { oceanPrincipal?: Principal; }
}
const registrationSchema = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{2,62}$/),
  displayName: z.string().min(2).max(120),
  email: z.email().max(254).transform(s => s.toLowerCase()),
  password: z.string().min(12).max(128),
}).strict();
const loginSchema = z.object({
  tenantSlug: z.string().min(3).max(63),
  email: z.email().transform(s => s.toLowerCase()),
  password: z.string().min(1),
}).strict();
const activateSchema = z.object({ enabled: z.boolean() }).strict();
const usageSchema = z.object({
  moduleKey: z.string().regex(/^[A-Z_]{3,50}$/),
  idempotencyKey: z.string().min(8).max(128),
  quantity: z.number().int().positive().max(1_000_000),
}).strict();
type AuditWriter = { query: (sql: string, args?: unknown[]) => Promise<unknown> };
async function audit(client: AuditWriter, tenantId: string, actorId: string, action: string, resource: string, detail: Record<string, unknown> = {}) {
  await client.query(
    "INSERT INTO ocean_audit_events(tenant_id,actor_id,action,resource,detail) VALUES($1,$2,$3,$4,$5::jsonb)",
    [tenantId, actorId, action, resource, JSON.stringify(detail)],
  );
}
export function createOceanApp(pool: Pool): FastifyInstance {
  const app = Fastify({ logger: false, bodyLimit: 128 * 1024, trustProxy: false });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof z.ZodError) return void reply.code(400).send({ error: "Invalid request", issues: error.issues });
    const code = (error as { code?: string }).code;
    if (code === "23505") return void reply.code(409).send({ error: "Record already exists" });
    app.log.error(error);
    return void reply.code(500).send({ error: "Internal server error" });
  });
  const publicPaths = new Set(["/healthz", "/readyz", "/v1/tenants/register", "/v1/auth/login"]);
  app.addHook("onRequest", async (request, reply) => {
    if (publicPaths.has(request.url.split("?")[0]!)) return;
    const slug = request.headers["x-ocean-tenant"];
    const auth = request.headers.authorization;
    if (typeof slug !== "string" || !auth?.startsWith("Bearer ")) {
      return reply.code(401).send({ error: "Tenant-bound bearer session required" });
    }
    const token = auth.slice(7);
    if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) {
      return reply.code(401).send({ error: "Invalid session" });
    }
    const tenant = await pool.query<{ id: string }>("SELECT id FROM ocean_tenants WHERE slug=$1", [slug]);
    const tenantId = tenant.rows[0]?.id;
    if (!tenantId) return reply.code(401).send({ error: "Invalid session" });
    const session = await withTenant(pool, tenantId, async client => {
      const result = await client.query<{ id: string; user_id: string; role: MemberRole }>(
        "SELECT s.id,s.user_id,m.role FROM ocean_sessions s JOIN ocean_memberships m ON m.user_id=s.user_id AND m.tenant_id=s.tenant_id WHERE s.tenant_id=$1 AND s.token_hash=$2 AND s.revoked_at IS NULL AND s.expires_at>now()",
        [tenantId, tokenDigest(token)],
      );
      return result.rows[0];
    });
    if (!session) return reply.code(401).send({ error: "Invalid session" });
    request.oceanPrincipal = { tenantId, userId: session.user_id, role: session.role, sessionId: session.id };
  });
  function requireAdmin(request: FastifyRequest) {
    return request.oceanPrincipal?.role === "OWNER" || request.oceanPrincipal?.role === "ADMIN";
  }
  app.get("/healthz", async () => ({ status: "ok", service: "ocean-cloud-control-plane" }));
  app.get("/readyz", async (_req, reply) => {
    try { await pool.query("SELECT 1"); return { status: "ready" }; }
    catch { return reply.code(503).send({ status: "database_unavailable" }); }
  });
  app.post("/v1/tenants/register", async (request, reply) => {
    if (process.env.OCEAN_SIGNUP_ENABLED !== "true" || process.env.NODE_ENV === "production") {
      return reply.code(403).send({ error: "Self-registration is disabled" });
    }
    const body = registrationSchema.parse(request.body);
    const password = await hashPassword(body.password);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const t = await client.query<{id:string}>(
        "INSERT INTO ocean_tenants(slug,display_name) VALUES($1,$2) RETURNING id",
        [body.slug, body.displayName],
      );
      const tenantId = t.rows[0]!.id;
      const u = await client.query<{id:string}>(
        "INSERT INTO ocean_users(email,password_salt,password_hash) VALUES($1,$2,$3) RETURNING id",
        [body.email, password.salt, password.hash],
      );
      const userId = u.rows[0]!.id;
      await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]);
      await client.query("INSERT INTO ocean_memberships(tenant_id,user_id,role) VALUES($1,$2,'OWNER')", [tenantId, userId]);
      await client.query("INSERT INTO ocean_subscriptions(tenant_id) VALUES($1)", [tenantId]);
      await client.query("INSERT INTO ocean_entitlements(tenant_id,module_key,enabled,updated_by) VALUES($1,'AIG_WORK',true,$2)", [tenantId, userId]);
      await audit(client, tenantId, userId, "TENANT_CREATED", body.slug);
      await client.query("COMMIT");
      return reply.code(201).send({ tenantId, slug: body.slug, ownerId: userId, status: "TRIAL_PENDING_BILLING" });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally { client.release(); }
  });
  app.post("/v1/auth/login", async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const result = await pool.query<{tenant_id:string;user_id:string;password_salt:string;password_hash:string}>(
      "SELECT t.id AS tenant_id,u.id AS user_id,u.password_salt,u.password_hash FROM ocean_tenants t CROSS JOIN ocean_users u WHERE t.slug=$1 AND u.email=$2",
      [body.tenantSlug,body.email],
    );
    const identity = result.rows[0];
    if (!identity) return reply.code(401).send({ error: "Invalid credentials" });
    // Persistent, tenant-bound account lockout. A load balancer must also enforce
    // independent IP/network quotas: this alone does not stop distributed abuse.
    const locked = await withTenant(pool, identity.tenant_id, async client => {
      const attempt = await client.query<{blocked:boolean}>(
        "SELECT (blocked_until > now()) AS blocked FROM ocean_auth_failures WHERE tenant_id=$1 AND email=$2",
        [identity.tenant_id, body.email],
      );
      return attempt.rows[0]?.blocked === true;
    });
    if (locked) return reply.code(429).header("Retry-After", "900").send({ error: "Login temporarily unavailable" });
    if (!(await verifyPassword(body.password, identity.password_salt, identity.password_hash))) {
      await withTenant(pool, identity.tenant_id, async client => {
        await client.query(
          `INSERT INTO ocean_auth_failures(tenant_id,email,failed_attempts,blocked_until)
           VALUES($1,$2,1,NULL)
           ON CONFLICT(tenant_id,email) DO UPDATE SET
             failed_attempts = CASE WHEN ocean_auth_failures.blocked_until <= now() THEN 1
                                    ELSE least(ocean_auth_failures.failed_attempts+1,20) END,
             blocked_until = CASE WHEN ocean_auth_failures.blocked_until > now() THEN ocean_auth_failures.blocked_until
                                  WHEN ocean_auth_failures.blocked_until <= now() THEN NULL
                                  WHEN ocean_auth_failures.failed_attempts+1 >= 5 THEN now()+interval '15 minutes'
                                  ELSE NULL END,
             updated_at=now()`,
          [identity.tenant_id, body.email],
        );
      });
      return reply.code(401).send({ error: "Invalid credentials" });
    }
    const token = newSessionToken();
    const authorized = await withTenant(pool, identity.tenant_id, async client => {
      const member = await client.query<{role:MemberRole}>("SELECT role FROM ocean_memberships WHERE tenant_id=$1 AND user_id=$2", [identity.tenant_id,identity.user_id]);
      if (!member.rows[0]) return false;
      await client.query("DELETE FROM ocean_auth_failures WHERE tenant_id=$1 AND email=$2", [identity.tenant_id, body.email]);
      await client.query(
        "INSERT INTO ocean_sessions(tenant_id,user_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",
        [identity.tenant_id,identity.user_id,tokenDigest(token)],
      );
      await audit(client, identity.tenant_id, identity.user_id, "LOGIN", "SESSION");
      return true;
    });
    if (!authorized) return reply.code(401).send({ error: "Invalid credentials" });
    return { accessToken: token, tokenType: "Bearer", expiresIn: 3600, tenantSlug: body.tenantSlug };
  });
  app.post("/v1/auth/logout", async request => {
    const p = request.oceanPrincipal!;
    return withTenant(pool, p.tenantId, async client => {
      await client.query("UPDATE ocean_sessions SET revoked_at=now() WHERE id=$1 AND tenant_id=$2", [p.sessionId,p.tenantId]);
      await audit(client,p.tenantId,p.userId,"LOGOUT","SESSION");
      return { revoked: true };
    });
  });
  app.get("/v1/me", async request => {
    const p = request.oceanPrincipal!;
    return withTenant(pool,p.tenantId,async client => {
      const u = await client.query<{email:string}>("SELECT email FROM ocean_users WHERE id=$1", [p.userId]);
      return { userId:p.userId, tenantId:p.tenantId, role:p.role, email:u.rows[0]!.email };
    });
  });
  app.get("/v1/modules", async request => {
    const p=request.oceanPrincipal!;
    return withTenant(pool,p.tenantId,async client => {
      const result=await client.query<{module_key:string;display_name:string;enabled:boolean}>(
        "SELECT c.module_key,c.display_name,COALESCE(e.enabled,false) enabled FROM ocean_module_catalog c LEFT JOIN ocean_entitlements e ON e.module_key=c.module_key AND e.tenant_id=$1 ORDER BY c.module_key",
        [p.tenantId],
      );
      return { modules: result.rows };
    });
  });
  app.put("/v1/modules/:key/activation", async (request,reply) => {
    if(!requireAdmin(request)) return reply.code(403).send({error:"Admin role required"});
    const p=request.oceanPrincipal!;
    const {key}=z.object({key:z.string().regex(/^[A-Z_]{3,50}$/)}).parse(request.params);
    const body=activateSchema.parse(request.body);
    // Activation grants an entitlement record, NOT a live product deployment.
    return withTenant(pool,p.tenantId,async client => {
      const catalog=await client.query("SELECT 1 FROM ocean_module_catalog WHERE module_key=$1",[key]);
      if(!catalog.rowCount) return reply.code(404).send({error:"Unknown module"});
      await client.query(
        "INSERT INTO ocean_entitlements(tenant_id,module_key,enabled,updated_by) VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id,module_key) DO UPDATE SET enabled=EXCLUDED.enabled,updated_by=EXCLUDED.updated_by,updated_at=now()",
        [p.tenantId,key,body.enabled,p.userId],
      );
      await audit(client,p.tenantId,p.userId,body.enabled?"MODULE_ENABLED":"MODULE_DISABLED",key);
      return { moduleKey:key,enabled:body.enabled,provisioned:false,externalServiceConnected:false };
    });
  });
  app.get("/v1/subscription", async request => {
    const p=request.oceanPrincipal!;
    return withTenant(pool,p.tenantId,async client => {
      const x=await client.query("SELECT plan_key,status FROM ocean_subscriptions WHERE tenant_id=$1",[p.tenantId]);
      return { subscription:x.rows[0]??null, charged:false };
    });
  });
  app.post("/v1/usage", async (request,reply) => {
    if(!requireAdmin(request))return reply.code(403).send({error:"Admin role required"});
    const p=request.oceanPrincipal!, body=usageSchema.parse(request.body);
    return withTenant(pool,p.tenantId,async client => {
      const entitlement=await client.query<{enabled:boolean}>(
        "SELECT enabled FROM ocean_entitlements WHERE tenant_id=$1 AND module_key=$2",
        [p.tenantId,body.moduleKey],
      );
      if(!entitlement.rows[0]?.enabled)return reply.code(403).send({error:"Module not enabled"});
      const e=await client.query<{id:string}>(
        "INSERT INTO ocean_usage_events(tenant_id,module_key,idempotency_key,quantity,recorded_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(tenant_id,idempotency_key) DO NOTHING RETURNING id",
        [p.tenantId,body.moduleKey,body.idempotencyKey,body.quantity,p.userId],
      );
      if(e.rows[0]) await audit(client,p.tenantId,p.userId,"USAGE_RECORDED",body.moduleKey,{quantity:body.quantity});
      return reply.code(e.rows[0]?201:200).send({recorded:!!e.rows[0],duplicate:!e.rows[0],billed:false});
    });
  });
  app.get("/v1/usage", async request => {
    const p=request.oceanPrincipal!;
    return withTenant(pool,p.tenantId,async client => {
      const x=await client.query(
        "SELECT module_key,COUNT(*)::int events,COALESCE(SUM(quantity),0)::bigint quantity FROM ocean_usage_events WHERE tenant_id=$1 GROUP BY module_key ORDER BY module_key",
        [p.tenantId],
      );
      return {usage:x.rows,charged:false};
    });
  });
  app.get("/v1/audit", async request => {
    const p=request.oceanPrincipal!;
    if(!requireAdmin(request))return {events:[]};
    return withTenant(pool,p.tenantId,async client => {
      const result=await client.query(
        "SELECT id,action,resource,correlation_id,created_at FROM ocean_audit_events WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 100",
        [p.tenantId],
      );
      return {events:result.rows};
    });
  });
  void registerExtendedRoutes(app,pool);
  void registerOceanStorageRoutes(app,pool);
  return app;
}
