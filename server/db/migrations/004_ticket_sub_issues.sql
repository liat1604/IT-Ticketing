BEGIN;

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS parent_ticket_id UUID
    REFERENCES tickets(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ;

DO $$
BEGIN
  ALTER TABLE tickets
    ADD CONSTRAINT ticket_cannot_parent_itself
      CHECK (parent_ticket_id IS NULL OR parent_ticket_id <> id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS tickets_parent_index
  ON tickets (parent_ticket_id, status, created_at);

CREATE INDEX IF NOT EXISTS tickets_due_index
  ON tickets (due_at)
  WHERE due_at IS NOT NULL AND status <> 'RESOLVED';

COMMIT;
