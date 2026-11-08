import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { appPool } from "../src/db.js";
import { createOceanApp } from "../src/app.js";

test("authentication quotas are shared through PostgreSQL across app processes",async()=>{
  process.env.OCEAN_RATE_LIMIT_KEY_HEX=
    "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
  const pool=appPool();
  const first=createOceanApp(pool);
  const second=createOceanApp(pool);
  const unique=randomUUID().slice(0,12);
  const credentials={
    tenantSlug:"test-"+unique,
    email:"unknown-"+unique+"@example.test",
    password:"invalid-test-input",
  };
  try {
    for(let i=0;i<15;i++){
      const app=i%2===0?first:second;
      const response=await app.inject({
        method:"POST",url:"/v1/auth/login",payload:credentials,
      });
      assert.equal(response.statusCode,401,"Expected default invalid-credential response");
    }
    const exhausted=await second.inject({
      method:"POST",url:"/v1/auth/login",payload:credentials,
    });
    assert.equal(exhausted.statusCode,429);
    assert.ok(Number(exhausted.headers["retry-after"])>0);
    const stored=await pool.query<{key_digest:string}>(
      "SELECT key_digest FROM ocean_request_limits",
    );
    assert.ok(stored.rows.every(row=>/^[a-f0-9]{64}$/.test(row.key_digest)));
    assert.ok(stored.rows.every(row=>!row.key_digest.includes(credentials.email)));
  } finally {
    await first.close();
    await second.close();
    await pool.end();
  }
});
