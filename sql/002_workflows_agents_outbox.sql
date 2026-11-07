-- Stage 2: controlled workflow, agent registration and durable events.
-- All records are tenant-owned; none grants operational AI or external-product authority.
CREATE TABLE IF NOT EXISTS ocean_approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES ocean_tenants(id),
  requested_by uuid NOT NULL REFERENCES ocean_users(id),
  decided_by uuid REFERENCES ocean_users(id),
  action_key text NOT NULL CHECK(action_key IN ('CONNECT_PRODUCT','ENABLE_AI_AGENT','EXPORT_DATA')),
  resource_key text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  UNIQUE(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS ocean_agent_registry (
  tenant_id uuid NOT NULL REFERENCES ocean_tenants(id),
  agent_key text NOT NULL CHECK(agent_key ~ '^[a-z0-9][a-z0-9-]{2,62}$'),
  description text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT false CHECK(enabled = false),
  created_by uuid NOT NULL REFERENCES ocean_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,agent_key)
);
CREATE TABLE IF NOT EXISTS ocean_event_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES ocean_tenants(id),
  event_type text NOT NULL,
  resource_id text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','DELIVERED','FAILED')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ocean_outbox_pending ON ocean_event_outbox(tenant_id,created_at) WHERE status='PENDING';

-- This is a catalog of product integration contracts; NOT operational connectivity.
CREATE TABLE IF NOT EXISTS ocean_product_adapters (
  tenant_id uuid NOT NULL REFERENCES ocean_tenants(id),
  adapter_key text NOT NULL,
  status text NOT NULL DEFAULT 'DISCONNECTED' CHECK(status='DISCONNECTED'),
  created_by uuid NOT NULL REFERENCES ocean_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,adapter_key)
);
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['ocean_approval_requests','ocean_agent_registry',
                             'ocean_event_outbox','ocean_product_adapters']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tbl);
    EXECUTE format('DROP POLICY IF EXISTS tenant_scope ON %I',tbl);
    EXECUTE format(
      'CREATE POLICY tenant_scope ON %I FOR ALL USING (tenant_id = nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',
      tbl
    );
  END LOOP;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='ocean_app') THEN
    GRANT SELECT,INSERT,UPDATE ON ocean_approval_requests TO ocean_app;
    GRANT SELECT,INSERT ON ocean_agent_registry,ocean_event_outbox,ocean_product_adapters TO ocean_app;
  END IF;
END $$;
