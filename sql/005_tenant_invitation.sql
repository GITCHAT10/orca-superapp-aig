-- UAT-only tenant invitation flow. No messaging provider is connected.
-- The opaque invite secret is returned ONLY when non-production onboarding
-- is explicitly enabled and must never enter logs or the audit ledger.
CREATE TABLE IF NOT EXISTS ocean_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES ocean_tenants(id),
  email text NOT NULL CHECK (email=lower(email)),
  role text NOT NULL CHECK (role IN ('ADMIN','MEMBER')),
  token_hash text NOT NULL UNIQUE,
  invited_by uuid NOT NULL REFERENCES ocean_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  accepted_user_id uuid REFERENCES ocean_users(id),
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS ocean_invitations_tenant_expires
  ON ocean_invitations(tenant_id, expires_at DESC);
ALTER TABLE ocean_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocean_invitations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_scope ON ocean_invitations;
CREATE POLICY tenant_scope ON ocean_invitations FOR ALL
  USING (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='ocean_app') THEN
    GRANT SELECT,INSERT,UPDATE ON ocean_invitations TO ocean_app;
  END IF;
END $$;
