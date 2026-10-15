BEGIN;

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE job_cards ADD COLUMN IF NOT EXISTS department TEXT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tickets_department_check'
  ) THEN
    ALTER TABLE tickets
      ADD CONSTRAINT tickets_department_check
      CHECK (department IS NULL OR department IN ('CSIS', 'Statistics', 'Mathematics'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'job_cards_department_check'
  ) THEN
    ALTER TABLE job_cards
      ADD CONSTRAINT job_cards_department_check
      CHECK (department IS NULL OR department IN ('CSIS', 'Statistics', 'Mathematics'));
  END IF;
END $$;

UPDATE job_cards AS jc
SET department = t.department
FROM tickets AS t
WHERE jc.primary_ticket_id = t.id
  AND jc.department IS DISTINCT FROM t.department;

CREATE OR REPLACE FUNCTION sync_job_card_department_from_ticket()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE job_cards
  SET department = NEW.department,
      updated_at = CURRENT_TIMESTAMP
  WHERE primary_ticket_id = NEW.id
    AND department IS DISTINCT FROM NEW.department;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tickets_sync_department_to_job_cards ON tickets;
CREATE TRIGGER tickets_sync_department_to_job_cards
AFTER INSERT OR UPDATE OF department, assigned_to ON tickets
FOR EACH ROW
EXECUTE FUNCTION sync_job_card_department_from_ticket();

COMMIT;
