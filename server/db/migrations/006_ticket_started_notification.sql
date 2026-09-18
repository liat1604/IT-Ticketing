BEGIN;

DELETE FROM notification_outbox duplicate
USING notification_outbox original
WHERE duplicate.event_type = 'TICKET_STARTED'
  AND original.event_type = 'TICKET_STARTED'
  AND duplicate.ticket_id = original.ticket_id
  AND duplicate.created_at > original.created_at;

CREATE UNIQUE INDEX IF NOT EXISTS one_ticket_started_notification_per_ticket
  ON notification_outbox (ticket_id)
  WHERE event_type = 'TICKET_STARTED';

COMMIT;
