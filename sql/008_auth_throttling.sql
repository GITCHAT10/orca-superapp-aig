-- Durable shared throttling for anonymous and authenticated authentication
-- entrypoints. Keys are HMAC digests; no IP/email/token is stored in plaintext.
-- This table is intentionally NOT tenant-owned: anonymous request sources have
-- no authenticated tenant and cannot set PostgreSQL tenant context.
CREATE TABLE IF NOT EXISTS ocean_request_limits (
  key_digest text PRIMARY KEY CHECK (key_digest ~ '^[a-f0-9]{64}$'),
  attempts integer NOT NULL DEFAULT 1 CHECK (attempts >= 1),
  window_started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ocean_request_limits_expires_at
  ON ocean_request_limits(expires_at);
REVOKE ALL ON ocean_request_limits FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='ocean_app') THEN
    GRANT SELECT,INSERT,UPDATE ON ocean_request_limits TO ocean_app;
  END IF;
END $$;
