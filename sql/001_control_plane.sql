-- OCEAN CLOUD v0.1: standalone public SaaS tenant domain. No BRAIN CORAL tables,
-- credentials, memory, accounts or database connections are imported here.
-- Run as migration owner; the web API MUST connect as a distinct non-owner role.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS ocean_tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{2,62}$'),
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 120),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ocean_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE CHECK (email = lower(email)),
  password_salt text NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ocean_memberships (
  tenant_id uuid NOT NULL REFERENCES ocean_tenants(id),
  user_id uuid NOT NULL REFERENCES ocean_users(id),
  role text NOT NULL CHECK (role IN ('OWNER','ADMIN','MEMBER')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,user_id)
);
CREATE TABLE IF NOT EXISTS ocean_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES ocean_tenants(id),
  user_id uuid NOT NULL REFERENCES ocean_users(id),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ocean_module_catalog (
  module_key text PRIMARY KEY,
  display_name text NOT NULL
);
INSERT INTO ocean_module_catalog(module_key,display_name) VALUES
  ('AIG_WORK','AIG WORK'),
  ('AIG_HOSPITALITY','AIG HOSPITALITY'),
  ('AIG_TRAVEL','AIG TRAVEL'),
  ('AIG_FINANCE','AIG FINANCE'),
  ('AIG_STUDIO','AIG STUDIO'),
  ('AIG_ACADEMY','AIG ACADEMY'),
  ('AIG_PROJECTS','AIG PROJECTS'),
  ('AIG_BOS','AIG BOS'),
  ('AIG_COMMERCE','AIG COMMERCE'),
  ('AIG_UTILITIES','AIG UTILITIES'),
  ('AIG_MAILMAN','AIG MAILMAN')
ON CONFLICT (module_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS ocean_entitlements (
  tenant_id uuid NOT NULL REFERENCES ocean_tenants(id),
  module_key text NOT NULL REFERENCES ocean_module_catalog(module_key),
  enabled boolean NOT NULL DEFAULT false,
  updated_by uuid NOT NULL REFERENCES ocean_users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,module_key)
);
CREATE TABLE IF NOT EXISTS ocean_subscriptions (
  tenant_id uuid PRIMARY KEY REFERENCES ocean_tenants(id),
  plan_key text NOT NULL DEFAULT 'TRIAL',
  status text NOT NULL DEFAULT 'PENDING_BILLING' CHECK (status IN ('PENDING_BILLING','ACTIVE','SUSPENDED')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ocean_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES ocean_tenants(id),
  module_key text NOT NULL REFERENCES ocean_module_catalog(module_key),
  idempotency_key text NOT NULL,
  quantity integer NOT NULL CHECK(quantity > 0 AND quantity <= 1000000),
  recorded_by uuid NOT NULL REFERENCES ocean_users(id),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,idempotency_key)
);
CREATE TABLE IF NOT EXISTS ocean_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES ocean_tenants(id),
  actor_id uuid NOT NULL REFERENCES ocean_users(id),
  action text NOT NULL,
  resource text NOT NULL,
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ocean_audit_tenant_time ON ocean_audit_events(tenant_id,created_at DESC);
CREATE INDEX IF NOT EXISTS ocean_usage_tenant_time ON ocean_usage_events(tenant_id,recorded_at DESC);

-- Row-level security is mandatory and FORCED even for a table-owner connection.
-- App DB user must NOT be superuser, BYPASSRLS or a table owner.
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['ocean_memberships','ocean_sessions','ocean_entitlements',
                             'ocean_subscriptions','ocean_usage_events','ocean_audit_events']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS tenant_scope ON %I', tbl);
    EXECUTE format(
      'CREATE POLICY tenant_scope ON %I FOR ALL USING (tenant_id = nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',
      tbl
    );
  END LOOP;
END $$;

-- Extra guard for evidentiary history; app role is not granted UPDATE or DELETE.
CREATE OR REPLACE FUNCTION ocean_block_audit_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Audit entries are append-only'; END; $$;
DROP TRIGGER IF EXISTS ocean_audit_append_only ON ocean_audit_events;
CREATE TRIGGER ocean_audit_append_only BEFORE UPDATE OR DELETE
ON ocean_audit_events FOR EACH ROW EXECUTE FUNCTION ocean_block_audit_mutation();

-- Provision ocean_app as a NON-OWNER login role outside this migration.
-- Migration runner grants permissions only if the role already exists.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ocean_app') THEN
    GRANT USAGE ON SCHEMA public TO ocean_app;
    GRANT SELECT, INSERT ON ocean_tenants, ocean_users TO ocean_app;
    GRANT SELECT ON ocean_module_catalog TO ocean_app;
    GRANT SELECT, INSERT, UPDATE ON ocean_memberships, ocean_sessions, ocean_entitlements TO ocean_app;
    GRANT SELECT, INSERT ON ocean_subscriptions, ocean_usage_events, ocean_audit_events TO ocean_app;
  END IF;
END $$;
