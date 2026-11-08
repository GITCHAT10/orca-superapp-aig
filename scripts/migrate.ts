import { readFile } from "node:fs/promises";
import pg from "pg";
const databaseUrl=process.env.OCEAN_MIGRATION_DATABASE_URL;
if(!databaseUrl) throw new Error("OCEAN_MIGRATION_DATABASE_URL required");
const client=new pg.Client({connectionString:databaseUrl});
try {
  await client.connect();
  for (const file of ["001_control_plane.sql", "002_workflows_agents_outbox.sql", "003_storage_model_routes.sql", "004_login_abuse_gate.sql", "005_tenant_invitation.sql", "006_mfa_totp.sql", "007_session_mfa_assurance.sql"]) {
    const sql=await readFile(new URL("../sql/"+file,import.meta.url),"utf8");
    await client.query(sql);
  }
  console.log("OCEAN CLOUD schema migrated; RLS policies installed.");
} finally { await client.end(); }
