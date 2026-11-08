-- Mark session assurance explicitly; production must not trust legacy
-- password-only sessions even if they were issued before the policy changed.
ALTER TABLE ocean_sessions
  ADD COLUMN IF NOT EXISTS mfa_verified boolean NOT NULL DEFAULT false;
