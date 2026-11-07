import { readFile } from "node:fs/promises";
import pg from "pg";
const databaseUrl=process.env.OCEAN_MIGRATION_DATABASE_URL;
if(!databaseUrl) throw new Error("OCEAN_MIGRATION_DATABASE_URL required");
const client=new pg.Client({connectionString:databaseUrl});
try {
  await client.connect();
  const sql=await readFile(new URL("../sql/001_control_plane.sql",import.meta.url),"utf8");
  await client.query(sql);
  console.log("OCEAN CLOUD schema migrated; RLS policies installed.");
} finally { await client.end(); }
