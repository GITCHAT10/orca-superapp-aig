import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { appPool, withTenant } from "../src/db.js";
import { createOceanApp } from "../src/app.js";
import { hashPassword } from "../src/password.js";

test("real PostgreSQL SaaS kernel: authenticated two-tenant isolation, activation, usage and audit", async () => {
  process.env.OCEAN_SIGNUP_ENABLED="true";
  process.env.OCEAN_STORAGE_KEY_HEX="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  process.env.NODE_ENV="test";
  const pool=appPool();
  const app=createOceanApp(pool);
  const suffix=randomUUID().slice(0,8);
  const a={slug:"tenant-a-"+suffix,displayName:"Test Tenant A",email:"owner-a-"+suffix+"@example.test",password:"NotARealCredential!234"};
  const b={slug:"tenant-b-"+suffix,displayName:"Test Tenant B",email:"owner-b-"+suffix+"@example.test",password:"NotARealCredential!234"};
  async function call(method:"GET"|"POST"|"PUT", url:string, payload?:Record<string, unknown>, headers?:Record<string,string>) {
    const response=await app.inject({method,url,payload,headers:headers??{}});
    return {status:response.statusCode, body:response.json()};
  }
  try {
    // Readiness must inspect actual PostgreSQL FORCE RLS and a non-owner runtime.
    const readiness=await call("GET","/readyz");
    assert.equal(readiness.status,200,JSON.stringify(readiness.body));
    assert.equal(readiness.body.checksPassed,5);
    const priorKey=process.env.OCEAN_STORAGE_KEY_HEX;
    delete process.env.OCEAN_STORAGE_KEY_HEX;
    const unsafeReadiness=await call("GET","/readyz");
    assert.equal(unsafeReadiness.status,503);
    assert.ok(unsafeReadiness.body.failedChecks.includes("storageKeyConfigured"));
    process.env.OCEAN_STORAGE_KEY_HEX=priorKey;
    const aCreated=await call("POST","/v1/tenants/register",a);
    const bCreated=await call("POST","/v1/tenants/register",b);
    assert.equal(aCreated.status,201,JSON.stringify(aCreated.body));
    assert.equal(bCreated.status,201,JSON.stringify(bCreated.body));
    assert.notEqual(aCreated.body.tenantId,bCreated.body.tenantId);
    const aLogin=await call("POST","/v1/auth/login",{tenantSlug:a.slug,email:a.email,password:a.password});
    const bLogin=await call("POST","/v1/auth/login",{tenantSlug:b.slug,email:b.email,password:b.password});
    assert.equal(aLogin.status,200,JSON.stringify(aLogin.body));
    assert.equal(bLogin.status,200,JSON.stringify(bLogin.body));
    const aHeaders={"x-ocean-tenant":a.slug,Authorization:"Bearer "+aLogin.body.accessToken};
    const bHeaders={"x-ocean-tenant":b.slug,Authorization:"Bearer "+bLogin.body.accessToken};
    assert.equal((await call("GET","/v1/me",undefined,aHeaders)).body.tenantId,aCreated.body.tenantId);
    assert.equal((await call("GET","/v1/me",undefined,bHeaders)).body.tenantId,bCreated.body.tenantId);
    assert.equal((await call("GET","/v1/me",undefined,{"x-ocean-tenant":b.slug,Authorization:aHeaders.Authorization})).status,401);
    assert.equal((await call("POST","/v1/auth/login",{tenantSlug:b.slug,email:a.email,password:a.password})).status,401);
    assert.equal((await call("GET","/v1/me",undefined,{"x-ocean-tenant":a.slug})).status,401);
    assert.equal((await call("PUT","/v1/modules/AIG_TRAVEL/activation",{enabled:true},aHeaders)).status,200);
    const aModules=await call("GET","/v1/modules",undefined,aHeaders);
    const bModules=await call("GET","/v1/modules",undefined,bHeaders);
    assert.equal(aModules.body.modules.find((x:{module_key:string})=>x.module_key==="AIG_TRAVEL").enabled,true);
    assert.equal(bModules.body.modules.find((x:{module_key:string})=>x.module_key==="AIG_TRAVEL").enabled,false);
    const usage={moduleKey:"AIG_TRAVEL",idempotencyKey:"usage-"+suffix+"-000001",quantity:3};
    const first=await call("POST","/v1/usage",usage,aHeaders);
    const duplicate=await call("POST","/v1/usage",usage,aHeaders);
    assert.equal(first.status,201,JSON.stringify(first.body));
    assert.deepEqual(duplicate.body,{recorded:false,duplicate:true,billed:false});
    assert.equal((await call("POST","/v1/usage",usage,bHeaders)).status,403);
    const aAudit=await call("GET","/v1/audit",undefined,aHeaders);
    const bAudit=await call("GET","/v1/audit",undefined,bHeaders);
    assert.ok(aAudit.body.events.some((x:{action:string})=>x.action==="MODULE_ENABLED"));
    assert.ok(!bAudit.body.events.some((x:{action:string})=>x.action==="MODULE_ENABLED"));
    const rlsA=await withTenant(pool,aCreated.body.tenantId,async client=>
      client.query("SELECT COUNT(*)::int AS n FROM ocean_audit_events WHERE tenant_id=$1",[bCreated.body.tenantId]));
    assert.equal(rlsA.rows[0].n,0);
    const unscoped=await pool.query("SELECT COUNT(*)::int AS n FROM ocean_audit_events");
    assert.equal(unscoped.rows[0].n,0,"RLS must fail closed without tenant context");
    // P1/P2: maker-checker approvals, durable outbox and isolated agent registry.
    const request=await call("POST","/v1/workflows/approvals",{actionKey:"CONNECT_PRODUCT",resourceKey:"PRESTIGE_HOLIDAYS_OS"},aHeaders);
    assert.equal(request.status,201,JSON.stringify(request.body));
    const selfDecision=await call("POST","/v1/workflows/approvals/"+request.body.id+"/decision",{decision:"APPROVED"},aHeaders);
    assert.equal(selfDecision.status,409,"Maker must not approve own request");
    const otherTenantDecision=await call("POST","/v1/workflows/approvals/"+request.body.id+"/decision",{decision:"APPROVED"},bHeaders);
    assert.equal(otherTenantDecision.status,409,"Other tenant may not approve");
    const reviewerPassword="AnotherFakePassword!789";
    const reviewerEmail="checker-"+suffix+"@example.test";
    const hashed=await hashPassword(reviewerPassword);
    const reviewer=await pool.query<{id:string}>(
      "INSERT INTO ocean_users(email,password_salt,password_hash) VALUES($1,$2,$3) RETURNING id",
      [reviewerEmail,hashed.salt,hashed.hash],
    );
    await withTenant(pool,aCreated.body.tenantId,async client=>{
      await client.query(
        "INSERT INTO ocean_memberships(tenant_id,user_id,role) VALUES($1,$2,'ADMIN')",
        [aCreated.body.tenantId,reviewer.rows[0]!.id],
      );
    });
    const checker=await call("POST","/v1/auth/login",{tenantSlug:a.slug,email:reviewerEmail,password:reviewerPassword});
    assert.equal(checker.status,200);
    const checkerHeaders={"x-ocean-tenant":a.slug,Authorization:"Bearer "+checker.body.accessToken};
    const approved=await call("POST","/v1/workflows/approvals/"+request.body.id+"/decision",{decision:"APPROVED"},checkerHeaders);
    assert.equal(approved.status,200,JSON.stringify(approved.body));
    assert.equal(approved.body.executed,false,"Approval must not trigger an external action");
    assert.equal(approved.body.eventDelivery,"PENDING");
    const duplicateApproval=await call("POST","/v1/workflows/approvals/"+request.body.id+"/decision",{decision:"APPROVED"},checkerHeaders);
    assert.equal(duplicateApproval.status,409);
    const aOutbox=await call("GET","/v1/outbox",undefined,aHeaders);
    const bOutbox=await call("GET","/v1/outbox",undefined,bHeaders);
    assert.ok(aOutbox.body.events.some((x:{event_type:string})=>x.event_type==="APPROVAL_DECIDED"));
    assert.equal(bOutbox.body.events.length,0);
    assert.equal((await call("POST","/v1/agents",{agentKey:"ocean-advisor",description:"Synthetic test advisory"},aHeaders)).status,201);
    assert.equal((await call("GET","/v1/agents",undefined,bHeaders)).body.agents.length,0);
    const adapter=await call("POST","/v1/product-contracts/PRESTIGE_HOLIDAYS_OS/register",{},aHeaders);
    assert.equal(adapter.status,201);
    assert.equal(adapter.body.status,"DISCONNECTED");
    assert.equal((await call("GET","/v1/product-contracts",undefined,aHeaders)).body.privateBrainCoralAccess,false);
    const secretBuffer=Buffer.from("Synthetic tenant A confidential test object");
    const stored=await call("POST","/v1/objects",{objectName:"test.txt",base64Content:secretBuffer.toString("base64")},aHeaders);
    assert.equal(stored.status,201,JSON.stringify(stored.body));
    assert.equal(stored.body.encrypted,true);
    const loaded=await call("GET","/v1/objects/"+stored.body.id,undefined,aHeaders);
    assert.equal(loaded.status,200);
    assert.equal(Buffer.from(loaded.body.base64Content,"base64").toString(),secretBuffer.toString());
    assert.equal((await call("GET","/v1/objects/"+stored.body.id,undefined,bHeaders)).status,404);
    const raw=await withTenant(pool,aCreated.body.tenantId,async client=>
      client.query<{ciphertext:Buffer}>("SELECT ciphertext FROM ocean_objects WHERE id=$1",[stored.body.id]));
    assert.notEqual(raw.rows[0]!.ciphertext.toString(),secretBuffer.toString());
    const route=await call("PUT","/v1/agents/ocean-advisor/model-route",{provider:"OPENAI",modelId:"test-model-no-execution"},aHeaders);
    assert.equal(route.status,200,JSON.stringify(route.body));
    assert.equal(route.body.enabled,false);
    assert.equal((await call("GET","/v1/agents/model-routes",undefined,bHeaders)).body.routes.length,0);
    const logout=await call("POST","/v1/auth/logout",{},aHeaders);
    assert.equal(logout.status,200);
    assert.equal((await call("GET","/v1/me",undefined,aHeaders)).status,401);
    assert.equal((await call("GET","/v1/me",undefined,bHeaders)).status,200);
    // A login failure storm for Tenant A must trigger a durable lockout,
    // without taking down Tenant B (same service/process).
    for (let attempt=0;attempt<5;attempt++) {
      const wrong=await call("POST","/v1/auth/login",{tenantSlug:a.slug,email:a.email,password:"intentionally-incorrect"});
      assert.equal(wrong.status,401);
    }
    const blocked=await call("POST","/v1/auth/login",{tenantSlug:a.slug,email:a.email,password:a.password});
    assert.equal(blocked.status,429,"Account must be locked after five failures");
    assert.equal((await call("GET","/v1/me",undefined,bHeaders)).status,200);
    const aFailureState=await withTenant(pool,aCreated.body.tenantId,async client =>
      client.query<{failed_attempts:number;blocked:boolean}>(
        "SELECT failed_attempts,blocked_until>now() AS blocked FROM ocean_auth_failures WHERE tenant_id=$1 AND email=$2",
        [aCreated.body.tenantId,a.email],
      ));
    assert.equal(aFailureState.rows[0]?.blocked,true);
    assert.equal(aFailureState.rows[0]?.failed_attempts,5);
  } finally {await app.close();await pool.end();}
});

test("registration is disabled unless explicitly enabled in a nonproduction environment", async()=>{
  process.env.OCEAN_SIGNUP_ENABLED="false";
  const pool=appPool(),app=createOceanApp(pool);
  try {
    const r=await app.inject({method:"POST",url:"/v1/tenants/register",payload:{}});
    assert.equal(r.statusCode,403);
  } finally {await app.close();await pool.end();}
});
