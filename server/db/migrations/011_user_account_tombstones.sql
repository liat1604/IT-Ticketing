BEGIN;

-- Keep ticket and audit foreign keys intact when an account is permanently
-- removed from the login and administration flows.
ALTER TABLE users
  ADD COLUMN deleted_at TIMESTAMPTZ;

CREATE INDEX users_not_deleted_index
  ON users (full_name)
  WHERE deleted_at IS NULL;

COMMIT;
