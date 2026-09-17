import { Router } from "express";

import { pool } from "../db.js";
import {
  requireAuth,
  requireRole,
  type AuthenticatedRequest,
} from "../middleware/require-auth.js";

export const technicianRouter = Router();

technicianRouter.use(
  requireAuth,
  requireRole("TECHNICIAN", "ADMIN", "SYSTEM_ADMIN"),
);

technicianRouter.get("/queue", async (_request, response) => {
  try {
    const result = await pool.query(
      `SELECT
         tickets.id,
         tickets.ticket_number AS "ticketNumber",
         tickets.title,
         tickets.description,
         tickets.priority,
         tickets.status,
         tickets.location_details AS "locationDetails",
         tickets.station_reference AS "stationReference",
         tickets.created_at AS "createdAt",
         categories.name AS category,
         reporters.full_name AS "reporterName",
         reporters.email AS "reporterEmail",
         technicians.id AS "technicianId",
         technicians.full_name AS "technicianName",
         COALESCE(timer_totals.recorded_seconds, 0)::INTEGER
           AS "recordedSeconds",
         timer_totals.active_started_at AS "activeTimerStartedAt"
       FROM tickets
       JOIN categories
         ON categories.id = tickets.category_id
       JOIN users AS reporters
         ON reporters.id = tickets.reporter_id
       LEFT JOIN users AS technicians
         ON technicians.id = tickets.assigned_to
       LEFT JOIN LATERAL (
         SELECT
           COALESCE(
             SUM(
               EXTRACT(EPOCH FROM (stopped_at - started_at))
             ) FILTER (WHERE stopped_at IS NOT NULL),
             0
           ) AS recorded_seconds,
           MAX(started_at)
             FILTER (WHERE stopped_at IS NULL) AS active_started_at
         FROM time_entries
         WHERE time_entries.ticket_id = tickets.id
       ) AS timer_totals ON TRUE
       WHERE tickets.status <> 'RESOLVED'
       ORDER BY
         CASE tickets.priority
           WHEN 'CRITICAL' THEN 1
           WHEN 'HIGH' THEN 2
           WHEN 'MEDIUM' THEN 3
           WHEN 'LOW' THEN 4
         END,
         tickets.created_at ASC`,
    );

    response.json({ tickets: result.rows });
  } catch (error) {
    console.error("Could not load technician queue", error);
    response.status(500).json({
      error: "Could not load technician queue",
    });
  }
});

technicianRouter.post("/:ticketId/claim", async (request, response) => {
  const user = (request as unknown as AuthenticatedRequest).user;
  const { ticketId } = request.params;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query<{
      id: string;
      ticket_number: string;
      status: string;
    }>(
      `UPDATE tickets
       SET
         assigned_to = $1,
         status = CASE
           WHEN status = 'NEW' THEN 'ASSIGNED'::ticket_status
           ELSE status
         END,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
         AND status <> 'RESOLVED'
         AND (assigned_to IS NULL OR assigned_to = $1)
       RETURNING id, ticket_number, status`,
      [user.id, ticketId],
    );

    const ticket = result.rows[0];

    if (!ticket) {
      await client.query("ROLLBACK");
      response.status(409).json({
        error: "This ticket is already assigned to another technician",
      });
      return;
    }

    await client.query(
      `INSERT INTO audit_events (
         ticket_id,
         actor_id,
         action,
         new_values
       )
       VALUES ($1, $2, 'TICKET_CLAIMED', $3::jsonb)`,
      [
        ticket.id,
        user.id,
        JSON.stringify({
          assignedTo: user.id,
          status: ticket.status,
        }),
      ],
    );

    await client.query(
      `INSERT INTO notification_outbox (
         ticket_id,
         recipient_email,
         event_type,
         payload
       )
       SELECT
         tickets.id,
         reporters.email,
         'TICKET_CLAIMED',
         jsonb_build_object(
           'ticketNumber', tickets.ticket_number,
           'technicianName', $2::text
         )
       FROM tickets
       JOIN users AS reporters
         ON reporters.id = tickets.reporter_id
       WHERE tickets.id = $1`,
      [ticket.id, user.fullName],
    );

    await client.query("COMMIT");

    response.json({
      ticket: {
        id: ticket.id,
        ticketNumber: ticket.ticket_number,
        status: ticket.status,
        technicianId: user.id,
        technicianName: user.fullName,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Ticket claim failed", error);
    response.status(500).json({ error: "Ticket claim failed" });
  } finally {
    client.release();
  }
});

technicianRouter.post(
  "/:ticketId/timer/start",
  async (request, response) => {
    const user = (request as unknown as AuthenticatedRequest).user;
    const { ticketId } = request.params;
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const ticketResult = await client.query<{
        id: string;
        ticket_number: string;
        assigned_to: string | null;
        status: string;
      }>(
        `SELECT id, ticket_number, assigned_to, status
         FROM tickets
         WHERE id = $1
         FOR UPDATE`,
        [ticketId],
      );

      const ticket = ticketResult.rows[0];

      if (!ticket) {
        await client.query("ROLLBACK");
        response.status(404).json({ error: "Ticket not found" });
        return;
      }

      if (ticket.assigned_to !== user.id) {
        await client.query("ROLLBACK");
        response.status(403).json({
          error: "You must claim this ticket before starting work",
        });
        return;
      }

      if (ticket.status === "RESOLVED") {
        await client.query("ROLLBACK");
        response.status(409).json({
          error: "A resolved ticket cannot be started",
        });
        return;
      }

      const timerResult = await client.query<{
        id: string;
        started_at: Date;
      }>(
        `INSERT INTO time_entries (ticket_id, technician_id)
         VALUES ($1, $2)
         RETURNING id, started_at`,
        [ticket.id, user.id],
      );

      await client.query(
        `UPDATE tickets
         SET
           status = 'IN_PROGRESS',
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [ticket.id],
      );

      await client.query(
        `INSERT INTO audit_events (
           ticket_id,
           actor_id,
           action,
           new_values
         )
         VALUES ($1, $2, 'TIMER_STARTED', $3::jsonb)`,
        [
          ticket.id,
          user.id,
          JSON.stringify({
            timeEntryId: timerResult.rows[0].id,
            startedAt: timerResult.rows[0].started_at,
          }),
        ],
      );

      await client.query("COMMIT");

      response.status(201).json({
        timer: {
          id: timerResult.rows[0].id,
          startedAt: timerResult.rows[0].started_at,
        },
      });
    } catch (error) {
      await client.query("ROLLBACK");

      if ((error as { code?: string }).code === "23505") {
        response.status(409).json({
          error: "You already have an active job-card timer",
        });
        return;
      }

      console.error("Timer start failed", error);
      response.status(500).json({ error: "Timer start failed" });
    } finally {
      client.release();
    }
  },
);

technicianRouter.post(
  "/:ticketId/timer/stop",
  async (request, response) => {
    const user = (request as unknown as AuthenticatedRequest).user;
    const { ticketId } = request.params;
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const activeTimer = await client.query<{
        id: string;
      }>(
        `SELECT id
         FROM time_entries
         WHERE ticket_id = $1
           AND technician_id = $2
           AND stopped_at IS NULL
         ORDER BY started_at DESC
         LIMIT 1
         FOR UPDATE`,
        [ticketId, user.id],
      );

      const timer = activeTimer.rows[0];

      if (!timer) {
        await client.query("ROLLBACK");
        response.status(409).json({
          error: "There is no active timer for this ticket",
        });
        return;
      }

      const stoppedTimer = await client.query<{
        id: string;
        started_at: Date;
        stopped_at: Date;
        duration_seconds: number;
      }>(
        `UPDATE time_entries
         SET stopped_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING
           id,
           started_at,
           stopped_at,
           EXTRACT(EPOCH FROM (stopped_at - started_at))::INTEGER
             AS duration_seconds`,
        [timer.id],
      );

      const completed = stoppedTimer.rows[0];

      await client.query(
        `UPDATE tickets
         SET updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [ticketId],
      );

      await client.query(
        `INSERT INTO audit_events (
           ticket_id,
           actor_id,
           action,
           new_values
         )
         VALUES ($1, $2, 'TIMER_STOPPED', $3::jsonb)`,
        [
          ticketId,
          user.id,
          JSON.stringify({
            timeEntryId: completed.id,
            stoppedAt: completed.stopped_at,
            durationSeconds: completed.duration_seconds,
          }),
        ],
      );

      await client.query("COMMIT");

      response.json({
        timer: {
          id: completed.id,
          startedAt: completed.started_at,
          stoppedAt: completed.stopped_at,
          durationSeconds: completed.duration_seconds,
        },
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Timer stop failed", error);
      response.status(500).json({ error: "Timer stop failed" });
    } finally {
      client.release();
    }
  },
);