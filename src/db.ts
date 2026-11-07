import pg, { type PoolClient, type Pool } from "pg";
export { pg };
export function appPool(): Pool {
  const url = process.env.OCEAN_DATABASE_URL;
  if (!url) throw new Error("OCEAN_DATABASE_URL is required");
  return new pg.Pool({ connectionString: url, max: 10, connectionTimeoutMillis: 5000 });
}
export async function withTenant<T>(
  pool: Pool,
  tenantId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
