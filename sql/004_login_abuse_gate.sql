-- Persistent tenant-scoped login failure tracking. Distinct from sessions; the
-- service account is not allowed to bypass RLS. This is one defense in depth,
-- not a substitute for edge IP-based controls and enterprise MFA.
CREATE TABLE IF NOT EXISTS ocean_auth_failures (
  tenant_id uuid NOT NULL REFERENCES ocean_tenants(id),
  email text NOT NULL,
  failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  blocked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,email)
);
ALTER TABLE ocean_auth_failures ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocean_auth_failures FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_scope ON ocean_auth_failures;
CREATE POLICY tenant_scope ON ocean_auth_failures FOR ALL
  USING (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
CREATE INDEX IF NOT EXISTS ocean_auth_failures_expiry ON ocean_auth_failures(blocked_until);
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='ocean_app') THEN
    GRANT SELECT,INSERT,UPDATE,DELETE ON ocean_auth_failures TO ocean_app;
  END IF;
END $$;
