BEGIN;

DO $$ BEGIN
  CREATE TYPE job_card_status AS ENUM ('SCHEDULED', 'LIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE SEQUENCE IF NOT EXISTS job_card_number_sequence START WITH 318;

CREATE TABLE IF NOT EXISTS job_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_number TEXT NOT NULL UNIQUE DEFAULT ('JOB-' || NEXTVAL('job_card_number_sequence')),
  primary_ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  assigned_to UUID NOT NULL REFERENCES users(id),
  created_by UUID NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  location_id INTEGER REFERENCES locations(id),
  department TEXT CHECK (department IS NULL OR department IN ('CSIS', 'Statistics', 'Mathematics')),
  location_details TEXT,
  station_reference TEXT,
  scheduled_at TIMESTAMPTZ,
  target_at TIMESTAMPTZ,
  status job_card_status NOT NULL DEFAULT 'SCHEDULED',
  completion_note TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS job_card_related_tickets (
  job_card_id UUID NOT NULL REFERENCES job_cards(id) ON DELETE CASCADE,
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  PRIMARY KEY (job_card_id, ticket_id)
);

CREATE TABLE IF NOT EXISTS job_card_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_card_id UUID NOT NULL REFERENCES job_cards(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  is_complete BOOLEAN NOT NULL DEFAULT FALSE,
  position INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS job_card_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_card_id UUID NOT NULL REFERENCES job_cards(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS job_card_id UUID REFERENCES job_cards(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS job_cards_assignee_status_index ON job_cards (assigned_to, status, scheduled_at);
CREATE INDEX IF NOT EXISTS job_cards_ticket_index ON job_cards (primary_ticket_id);
CREATE INDEX IF NOT EXISTS time_entries_job_card_index ON time_entries (job_card_id, started_at);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_timer_per_job_card ON time_entries (job_card_id) WHERE stopped_at IS NULL AND job_card_id IS NOT NULL;

COMMIT;
