import type { Pool } from "pg";

export type ReadinessAssessment = {
  ready: boolean;
  checks: Readonly<Record<string,boolean>>;
  missing: string[];
};
/**
 * Privilege-aware operational gate. The HTTP server must never use a migration
 * owner, superuser, or BYPASSRLS role. Test actual PostgreSQL table flags,
 * not inferred deployment settings. No private credentials in results.
 */
export async function inspectOceanReadiness(pool: Pool): Promise<ReadinessAssessment> {
  const checks: Record<string,boolean> = {
    databaseReachable: false,
    nonPrivilegedRuntime: false,
    forcedTenantRls: false,
    storageKeyConfigured: false,
    registrationClosedInProduction: false,
  };
  try {
    const connection=await pool.query<{
      is_superuser:boolean;
      bypass_rls:boolean;
      owns_business_table:boolean;
    }>(`
      SELECT r.rolsuper AS is_superuser,
             r.rolbypassrls AS bypass_rls,
             EXISTS (
               SELECT 1 FROM pg_class c
               JOIN pg_namespace n ON n.oid=c.relnamespace
               WHERE n.nspname='public'
                 AND c.relname='ocean_sessions'
                 AND c.relowner=r.oid
             ) AS owns_business_table
      FROM pg_roles r WHERE r.rolname=current_user
    `);
    checks.databaseReachable=true;
    const role=connection.rows[0];
    checks.nonPrivilegedRuntime=Boolean(role&&!role.is_superuser&&!role.bypass_rls&&!role.owns_business_table);
    const rls=await pool.query<{count:string}>(`
      SELECT count(*)::text AS count FROM pg_class c
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public'
        AND c.relname=ANY($1::text[])
        AND c.relrowsecurity=true AND c.relforcerowsecurity=true
    `,[[
      "ocean_memberships","ocean_sessions","ocean_entitlements",
      "ocean_subscriptions","ocean_usage_events","ocean_audit_events",
      "ocean_approval_requests","ocean_agent_registry","ocean_event_outbox",
      "ocean_product_adapters","ocean_objects","ocean_model_routes",
      "ocean_auth_failures",
    ]]);
    checks.forcedTenantRls=Number(rls.rows[0]?.count)===13;
  }catch{
    checks.databaseReachable=false;
  }
  checks.storageKeyConfigured=/^[0-9a-fA-F]{64}$/.test(process.env.OCEAN_STORAGE_KEY_HEX??"");
  checks.registrationClosedInProduction=process.env.NODE_ENV!=="production"||
    process.env.OCEAN_SIGNUP_ENABLED!=="true";
  const missing=Object.entries(checks).filter(([,passed])=>!passed).map(([name])=>name);
  return {ready:missing.length===0,checks,missing};
}
