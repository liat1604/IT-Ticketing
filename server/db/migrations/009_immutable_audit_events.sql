BEGIN;

-- Audit history must remain readable even when the referenced ticket or user
-- is removed. Keep the historical UUIDs rather than allowing a foreign-key
-- action to rewrite an audit row.
ALTER TABLE audit_events
  DROP CONSTRAINT IF EXISTS audit_events_ticket_id_fkey,
  DROP CONSTRAINT IF EXISTS audit_events_actor_id_fkey;

CREATE OR REPLACE FUNCTION prevent_audit_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '42501',
    MESSAGE = 'audit_events are immutable: UPDATE, DELETE and TRUNCATE are not permitted';
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS audit_events_immutable_trigger ON audit_events;
DROP TRIGGER IF EXISTS audit_events_immutable_truncate_trigger ON audit_events;

CREATE TRIGGER audit_events_immutable_trigger
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_event_mutation();

CREATE TRIGGER audit_events_immutable_truncate_trigger
  BEFORE TRUNCATE ON audit_events
  FOR EACH STATEMENT
  EXECUTE FUNCTION prevent_audit_event_mutation();

ALTER TABLE audit_events ENABLE ALWAYS TRIGGER audit_events_immutable_trigger;
ALTER TABLE audit_events ENABLE ALWAYS TRIGGER audit_events_immutable_truncate_trigger;

REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM PUBLIC;

COMMIT;
