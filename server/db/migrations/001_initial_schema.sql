BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  CREATE TYPE user_role AS ENUM (
    'REPORTER',
    'TECHNICIAN',
    'ADMIN',
    'SYSTEM_ADMIN'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE ticket_priority AS ENUM (
    'LOW',
    'MEDIUM',
    'HIGH',
    'CRITICAL'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE ticket_status AS ENUM (
    'NEW',
    'ASSIGNED',
    'IN_PROGRESS',
    'AWAITING_FEEDBACK',
    'ESCALATED',
    'RESOLVED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE comment_visibility AS ENUM (
    'PUBLIC',
    'INTERNAL'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE ticket_source AS ENUM (
    'WEB',
    'WALK_IN'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE SEQUENCE IF NOT EXISTS ticket_number_sequence
  START WITH 1001;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'REPORTER',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique
  ON users (LOWER(email));

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO categories (name)
VALUES
  ('Hardware'),
  ('Software'),
  ('Network'),
  ('Access'),
  ('Physical Hazard'),
  ('Other')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS locations (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  ticket_number TEXT NOT NULL UNIQUE DEFAULT (
    'CSIS-' ||
    LPAD(NEXTVAL('ticket_number_sequence')::TEXT, 6, '0')
  ),

  reporter_id UUID NOT NULL REFERENCES users(id),
  created_by UUID NOT NULL REFERENCES users(id),
  assigned_to UUID REFERENCES users(id),

  category_id INTEGER NOT NULL REFERENCES categories(id),
  location_id INTEGER REFERENCES locations(id),
  department TEXT CHECK (department IS NULL OR department IN ('CSIS', 'Statistics', 'Mathematics')),

  location_details TEXT,
  station_reference TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,

  priority ticket_priority NOT NULL,
  status ticket_status NOT NULL DEFAULT 'NEW',
  source ticket_source NOT NULL DEFAULT 'WEB',

  resolution_summary TEXT,
  resolved_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS tickets_reporter_index
  ON tickets (reporter_id);

CREATE INDEX IF NOT EXISTS tickets_assigned_technician_index
  ON tickets (assigned_to);

CREATE INDEX IF NOT EXISTS tickets_queue_index
  ON tickets (status, priority, created_at);

CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  visibility comment_visibility NOT NULL DEFAULT 'PUBLIC',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT comment_body_not_empty
    CHECK (LENGTH(TRIM(body)) > 0)
);

CREATE INDEX IF NOT EXISTS comments_ticket_index
  ON comments (ticket_id, created_at);

CREATE TABLE IF NOT EXISTS time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  technician_id UUID NOT NULL REFERENCES users(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  stopped_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT valid_time_entry
    CHECK (stopped_at IS NULL OR stopped_at > started_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS one_active_timer_per_technician
  ON time_entries (technician_id)
  WHERE stopped_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS one_active_timer_per_ticket
  ON time_entries (ticket_id)
  WHERE stopped_at IS NULL;

CREATE TABLE IF NOT EXISTS escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id),
  escalated_by UUID NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  external_reference TEXT,
  escalated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS audit_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticket_id UUID REFERENCES tickets(id),
  actor_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  previous_values JSONB,
  new_values JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS audit_events_ticket_index
  ON audit_events (ticket_id, created_at);

CREATE TABLE IF NOT EXISTS notification_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID REFERENCES tickets(id),
  recipient_email TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  attempts INTEGER NOT NULL DEFAULT 0,
  processed_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS pending_notifications_index
  ON notification_outbox (created_at)
  WHERE processed_at IS NULL;

COMMIT;
