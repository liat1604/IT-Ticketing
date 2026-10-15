import type { PoolClient } from "pg";

type ActiveTimer = {
  id: string;
  ticket_id: string | null;
  technician_id: string;
  job_card_id: string | null;
  started_at: Date;
};

export async function startOrSwitchJobTimer(
  client: PoolClient,
  input: {
    ticketId: string | null;
    technicianId: string;
    jobCardId: string | null;
  },
) {
  const { ticketId, technicianId, jobCardId } = input;

  if (ticketId) {
    await client.query("SELECT id FROM tickets WHERE id = $1 FOR UPDATE", [ticketId]);
  }
  if (jobCardId && !ticketId) {
    await client.query("SELECT id FROM job_cards WHERE id = $1 FOR UPDATE", [jobCardId]);
  }

  if (!ticketId && !jobCardId) {
    throw new Error("A ticket or job card is required to start a timer");
  }

  const activeResult = ticketId
    ? await client.query<ActiveTimer>(
        `SELECT id, ticket_id, technician_id, job_card_id, started_at
         FROM time_entries
         WHERE ticket_id = $1 AND stopped_at IS NULL
         FOR UPDATE`,
        [ticketId],
      )
    : await client.query<ActiveTimer>(
        `SELECT id, ticket_id, technician_id, job_card_id, started_at
         FROM time_entries
         WHERE job_card_id = $1 AND stopped_at IS NULL
         FOR UPDATE`,
        [jobCardId],
      );
  const active = activeResult.rows[0];

  if (active) {
    if (active.technician_id !== technicianId) {
      const conflict = new Error("This ticket already has a timer running") as Error & {
        code: string;
      };
      conflict.code = "23505";
      throw conflict;
    }
    if (jobCardId && active.job_card_id && active.job_card_id !== jobCardId) {
      const conflict = new Error("This ticket already has a timer running on another job card") as Error & {
        code: string;
      };
      conflict.code = "23505";
      throw conflict;
    }
    if (jobCardId && active.job_card_id === null) {
      await client.query("UPDATE time_entries SET job_card_id = $2 WHERE id = $1", [
        active.id,
        jobCardId,
      ]);
    }
    if (jobCardId) {
      await client.query(
        `UPDATE job_cards SET status = 'LIVE', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status NOT IN ('COMPLETED', 'CANCELLED')`,
        [jobCardId],
      );
    }
    return { id: active.id, startedAt: active.started_at, alreadyRunning: true };
  }

  const started = await client.query<{ id: string; started_at: Date }>(
    `INSERT INTO time_entries (ticket_id, technician_id, job_card_id)
     VALUES ($1, $2, $3)
     RETURNING id, started_at`,
    [ticketId, technicianId, jobCardId],
  );

  if (jobCardId) {
    await client.query(
      `UPDATE job_cards SET status = 'LIVE', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status NOT IN ('COMPLETED', 'CANCELLED')`,
      [jobCardId],
    );
  }

  return {
    id: started.rows[0].id,
    startedAt: started.rows[0].started_at,
    alreadyRunning: false,
  };
}

export async function pauseJobCardTimer(
  client: PoolClient,
  input: { jobCardId: string; ticketId: string | null; technicianId: string },
) {
  const { jobCardId, ticketId, technicianId } = input;
  const stopped = await client.query(
    `UPDATE time_entries
     SET stopped_at = GREATEST(CURRENT_TIMESTAMP, started_at + INTERVAL '1 millisecond')
     WHERE stopped_at IS NULL
       AND (
         job_card_id = $1
         OR (
           job_card_id IS NULL
           AND ticket_id = $2
           AND technician_id = $3
         )
       )
     RETURNING id`,
    [jobCardId, ticketId, technicianId],
  );
  await client.query(
    `UPDATE job_cards
     SET status = 'PAUSED', updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [jobCardId],
  );
  return stopped.rowCount ?? 0;
}
