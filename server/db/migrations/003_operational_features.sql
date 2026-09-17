BEGIN;

DO $$
BEGIN
  CREATE TYPE schedule_event_type AS ENUM (
    'SLA',
    'SITE_VISIT',
    'MAINTENANCE',
    'FOLLOW_UP'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS schedule_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  event_type schedule_event_type NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  location TEXT,
  notes TEXT,
  ticket_id UUID REFERENCES tickets(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT schedule_event_title_not_empty
    CHECK (LENGTH(TRIM(title)) > 0),
  CONSTRAINT valid_schedule_event_range
    CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS schedule_events_start_index
  ON schedule_events (starts_at);

CREATE INDEX IF NOT EXISTS schedule_events_ticket_index
  ON schedule_events (ticket_id);

CREATE INDEX IF NOT EXISTS schedule_events_assignee_index
  ON schedule_events (assigned_to, starts_at);

INSERT INTO locations (name)
VALUES
  ('Building G'),
  ('Lab G14'),
  ('Lab G30'),
  ('Server Room'),
  ('Online')
ON CONFLICT (name) DO NOTHING;

COMMIT;
