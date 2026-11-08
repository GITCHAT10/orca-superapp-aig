-- RFC6238 TOTP as a second factor for authenticated tenant members.
-- Secrets are AES-GCM encrypted at application layer with a dedicated MFA key.
-- Pending enrollment expires; used time-steps are atomically monotonic.
CREATE TABLE IF NOT EXISTS ocean_mfa_credentials (
  tenant_id uuid NOT NULL REFERENCES ocean_tenants(id),
  user_id uuid NOT NULL REFERENCES ocean_users(id),
  enabled boolean NOT NULL DEFAULT false,
  secret_ciphertext bytea,
  secret_nonce bytea,
  secret_tag bytea,
  pending_ciphertext bytea,
  pending_nonce bytea,
  pending_tag bytea,
  pending_expires_at timestamptz,
  last_used_step bigint NOT NULL DEFAULT -1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id),
  FOREIGN KEY (tenant_id,user_id) REFERENCES ocean_memberships(tenant_id,user_id),
  CONSTRAINT ocean_mfa_active_secret CHECK (
    enabled = false OR (secret_ciphertext IS NOT NULL AND secret_nonce IS NOT NULL AND secret_tag IS NOT NULL)
  )
);
ALTER TABLE ocean_mfa_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocean_mfa_credentials FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_scope ON ocean_mfa_credentials;
CREATE POLICY tenant_scope ON ocean_mfa_credentials FOR ALL
  USING (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='ocean_app') THEN
    GRANT SELECT,INSERT,UPDATE ON ocean_mfa_credentials TO ocean_app;
  END IF;
END $$;
