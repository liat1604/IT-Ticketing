-- Walk-in job cards need their own escalation state because they do not have
-- a ticket row to carry the normal ticket escalation workflow.
ALTER TYPE job_card_status ADD VALUE IF NOT EXISTS 'ESCALATED';
