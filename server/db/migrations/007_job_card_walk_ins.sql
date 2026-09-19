BEGIN;

ALTER TABLE job_cards
  ALTER COLUMN primary_ticket_id DROP NOT NULL;

ALTER TABLE time_entries
  ALTER COLUMN ticket_id DROP NOT NULL;

ALTER TABLE job_cards
  ADD COLUMN IF NOT EXISTS priority ticket_priority,
  ADD COLUMN IF NOT EXISTS walk_in_reporter_name TEXT,
  ADD COLUMN IF NOT EXISTS walk_in_reporter_email TEXT;

UPDATE job_cards AS job_card
SET priority = ticket.priority
FROM tickets AS ticket
WHERE ticket.id = job_card.primary_ticket_id
  AND job_card.priority IS NULL;

UPDATE job_cards
SET priority = 'MEDIUM'
WHERE priority IS NULL;

ALTER TABLE job_cards
  ALTER COLUMN priority SET DEFAULT 'MEDIUM',
  ALTER COLUMN priority SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'job_card_has_ticket_or_walk_in_reporter'
  ) THEN
    ALTER TABLE job_cards
      ADD CONSTRAINT job_card_has_ticket_or_walk_in_reporter
      CHECK (
        primary_ticket_id IS NOT NULL
        OR LENGTH(TRIM(COALESCE(walk_in_reporter_name, ''))) >= 2
      );
  END IF;
END $$;

COMMIT;
