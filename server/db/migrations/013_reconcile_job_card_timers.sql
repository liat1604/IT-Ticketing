BEGIN;

UPDATE job_cards AS jc
SET status = 'PAUSED',
    updated_at = CURRENT_TIMESTAMP
WHERE jc.status = 'LIVE'
  AND NOT EXISTS (
    SELECT 1
    FROM time_entries AS te
    WHERE te.stopped_at IS NULL
      AND (
        te.job_card_id = jc.id
        OR (
          te.job_card_id IS NULL
          AND te.ticket_id = jc.primary_ticket_id
        )
      )
  );

COMMIT;
