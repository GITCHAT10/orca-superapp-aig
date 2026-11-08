import pg from "pg";
const url=process.env.OCEAN_MIGRATION_DATABASE_URL;
if(!url)throw new Error("OCEAN_MIGRATION_DATABASE_URL required");
const c=new pg.Client({connectionString:url});
try {
  await c.connect();
  await c.query("CREATE ROLE ocean_app LOGIN PASSWORD 'ci-only-password-no-production-use'");
} finally {await c.end();}
