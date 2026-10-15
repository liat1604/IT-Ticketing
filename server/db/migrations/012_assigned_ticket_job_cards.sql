BEGIN;

CREATE OR REPLACE FUNCTION create_job_card_for_assigned_ticket()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  linked_status job_card_status;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.assigned_to IS NOT DISTINCT FROM OLD.assigned_to THEN
    RETURN NEW;
  END IF;

  IF NEW.assigned_to IS NULL OR NOT EXISTS (
    SELECT 1
    FROM users
    WHERE id = NEW.assigned_to
      AND role = 'TECHNICIAN'
  ) THEN
    RETURN NEW;
  END IF;

  linked_status := CASE NEW.status::TEXT
    WHEN 'RESOLVED' THEN 'COMPLETED'::job_card_status
    WHEN 'ESCALATED' THEN 'ESCALATED'::job_card_status
    WHEN 'IN_PROGRESS' THEN 'LIVE'::job_card_status
    ELSE 'SCHEDULED'::job_card_status
  END;

  UPDATE job_cards
  SET assigned_to = NEW.assigned_to,
      updated_at = CURRENT_TIMESTAMP
  WHERE primary_ticket_id = NEW.id
    AND assigned_to IS DISTINCT FROM NEW.assigned_to;

  IF NOT FOUND THEN
    INSERT INTO job_cards (
      primary_ticket_id,
      assigned_to,
      created_by,
      title,
      description,
      category_id,
      priority,
      location_id,
      location_details,
      station_reference,
      status,
      completion_note,
      completed_at
    )
    SELECT
      NEW.id,
      NEW.assigned_to,
      NEW.assigned_to,
      NEW.title,
      NEW.description,
      NEW.category_id,
      NEW.priority,
      NEW.location_id,
      NEW.location_details,
      NEW.station_reference,
      linked_status,
      CASE WHEN NEW.status::TEXT = 'RESOLVED' THEN NEW.resolution_summary END,
      CASE WHEN NEW.status::TEXT = 'RESOLVED' THEN COALESCE(NEW.resolved_at, CURRENT_TIMESTAMP) END
    WHERE NOT EXISTS (
      SELECT 1 FROM job_cards WHERE primary_ticket_id = NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tickets_create_job_card_when_assigned ON tickets;
CREATE TRIGGER tickets_create_job_card_when_assigned
AFTER INSERT OR UPDATE OF assigned_to ON tickets
FOR EACH ROW
EXECUTE FUNCTION create_job_card_for_assigned_ticket();

INSERT INTO job_cards (
  primary_ticket_id,
  assigned_to,
  created_by,
  title,
  description,
  category_id,
  priority,
  location_id,
  location_details,
  station_reference,
  status,
  completion_note,
  completed_at
)
SELECT
  tickets.id,
  tickets.assigned_to,
  tickets.assigned_to,
  tickets.title,
  tickets.description,
  tickets.category_id,
  tickets.priority,
  tickets.location_id,
  tickets.location_details,
  tickets.station_reference,
  CASE tickets.status::TEXT
    WHEN 'RESOLVED' THEN 'COMPLETED'::job_card_status
    WHEN 'ESCALATED' THEN 'ESCALATED'::job_card_status
    WHEN 'IN_PROGRESS' THEN 'LIVE'::job_card_status
    ELSE 'SCHEDULED'::job_card_status
  END,
  CASE WHEN tickets.status::TEXT = 'RESOLVED' THEN tickets.resolution_summary END,
  CASE WHEN tickets.status::TEXT = 'RESOLVED' THEN COALESCE(tickets.resolved_at, CURRENT_TIMESTAMP) END
FROM tickets
JOIN users AS technicians ON technicians.id = tickets.assigned_to
WHERE tickets.assigned_to IS NOT NULL
  AND technicians.role = 'TECHNICIAN'
  AND NOT EXISTS (
    SELECT 1 FROM job_cards WHERE job_cards.primary_ticket_id = tickets.id
  );

COMMIT;
