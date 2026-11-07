import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { appPool, withTenant } from "../src/db.js";
import { createOceanApp } from "../src/app.js";

test("real PostgreSQL SaaS kernel: authenticated two-tenant isolation, activation, usage and audit", async () => {
  process.env.OCEAN_SIGNUP_ENABLED="true";
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
    const logout=await call("POST","/v1/auth/logout",{},aHeaders);
    assert.equal(logout.status,200);
    assert.equal((await call("GET","/v1/me",undefined,aHeaders)).status,401);
    assert.equal((await call("GET","/v1/me",undefined,bHeaders)).status,200);
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
