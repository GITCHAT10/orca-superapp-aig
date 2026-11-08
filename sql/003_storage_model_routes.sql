-- Tenant-isolated, AES-GCM application-encrypted small object store (MVP).
-- For larger files switch to approved S3-compatible encryption adapter without
-- bypassing identity, RLS, or private BRAIN CORAL boundary.
CREATE TABLE IF NOT EXISTS ocean_objects (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES ocean_tenants(id),
  object_name text NOT NULL CHECK(length(object_name) BETWEEN 1 AND 180),
  ciphertext bytea NOT NULL,
  nonce bytea NOT NULL,
  auth_tag bytea NOT NULL,
  sha256 text NOT NULL,
  created_by uuid NOT NULL REFERENCES ocean_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ocean_objects_tenant_time ON ocean_objects(tenant_id,created_at DESC);
ALTER TABLE ocean_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocean_objects FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_scope ON ocean_objects;
CREATE POLICY tenant_scope ON ocean_objects FOR ALL
  USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);

CREATE TABLE IF NOT EXISTS ocean_model_routes (
  tenant_id uuid NOT NULL,
  agent_key text NOT NULL,
  provider text NOT NULL CHECK(provider IN ('OPENAI','ANTHROPIC','OTHER')),
  model_id text NOT NULL,
  enabled boolean NOT NULL DEFAULT false CHECK(enabled=false),
  updated_by uuid NOT NULL REFERENCES ocean_users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,agent_key),
  FOREIGN KEY(tenant_id,agent_key) REFERENCES ocean_agent_registry(tenant_id,agent_key)
);
ALTER TABLE ocean_model_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocean_model_routes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_scope ON ocean_model_routes;
CREATE POLICY tenant_scope ON ocean_model_routes FOR ALL
  USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='ocean_app') THEN
    GRANT SELECT,INSERT ON ocean_objects TO ocean_app;
    GRANT SELECT,INSERT,UPDATE ON ocean_model_routes TO ocean_app;
  END IF;
END $$;
