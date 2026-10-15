import { Router } from "express";

import { pool } from "../db.js";
import {
  requireAuth,
  requireRole,
  type AuthenticatedRequest,
} from "../middleware/require-auth.js";
import { z } from "zod";
import { departments } from "../domain/departments.js";
import { startOrSwitchJobTimer } from "../services/job-timers.js";
import { enqueueTicketStarted } from "../services/notification-outbox.js";
export const technicianRouter = Router();

technicianRouter.use(
  requireAuth,
  requireRole("TECHNICIAN", "ADMIN", "SYSTEM_ADMIN"),
);
const updateStatusSchema = z
  .object({
    status: z.enum([
      "IN_PROGRESS",
      "AWAITING_FEEDBACK",
      "RESOLVED",
    ]),
    resolutionSummary: z
      .string()
      .trim()
      .max(2000)
      .optional(),
  })
  .superRefine((data, context) => {
    if (
      data.status === "RESOLVED" &&
      (!data.resolutionSummary ||
        data.resolutionSummary.length < 10)
    ) {
      context.addIssue({
        code: "custom",
        path: ["resolutionSummary"],
        message:
          "A resolution summary of at least 10 characters is required.",
      });
    }
  });

const manualTicketSchema = z.object({
  reporterId: z.string().uuid(),
  categoryId: z.number().int().positive(),
  department: z.enum(departments).nullable().optional(),
  locationId: z.number().int().positive().nullable().optional(),
  locationDetails: z.string().trim().max(200).optional(),
  stationReference: z.string().trim().max(50).optional(),
  title: z.string().trim().min(5).max(160),
  description: z.string().trim().min(10).max(4000),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
});

const escalationSchema = z.object({
  reason: z.string().trim().min(10).max(2000),
  externalReference: z.string().trim().max(120).optional(),
});

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
         tickets.department,
         tickets.location_details AS "locationDetails",
         tickets.station_reference AS "stationReference",
         tickets.due_at AS "dueAt",
         tickets.created_at AS "createdAt",
         categories.name AS category,
         reporters.full_name AS "reporterName",
         reporters.email AS "reporterEmail",
         technicians.id AS "technicianId",
         technicians.full_name AS "technicianName",
         parent.ticket_number AS "parentTicketNumber",
         parent.title AS "parentTicketTitle",
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
       LEFT JOIN tickets AS parent
         ON parent.id = tickets.parent_ticket_id
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
        title: string;
        assigned_to: string | null;
        status: string;
        reporter_email: string;
      }>(
        `SELECT tickets.id, tickets.ticket_number, tickets.title,
                tickets.assigned_to, tickets.status,
                reporters.email AS reporter_email
         FROM tickets
         JOIN users AS reporters ON reporters.id = tickets.reporter_id
         WHERE tickets.id = $1
         FOR UPDATE OF tickets`,
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

      const linkedCard = await client.query<{ id: string }>(
        `SELECT id FROM job_cards
         WHERE primary_ticket_id = $1
           AND status NOT IN ('COMPLETED', 'CANCELLED')
         ORDER BY created_at
         LIMIT 1
         FOR UPDATE`,
        [ticket.id],
      );
      const timer = await startOrSwitchJobTimer(client, {
        ticketId: ticket.id,
        technicianId: user.id,
        jobCardId: linkedCard.rows[0]?.id ?? null,
      });

      await client.query(
        `UPDATE tickets
         SET
           status = 'IN_PROGRESS',
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [ticket.id],
      );

      if (!timer.alreadyRunning) {
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
              timeEntryId: timer.id,
              startedAt: timer.startedAt,
            }),
          ],
        );
      }

      if (ticket.status !== "IN_PROGRESS") {
        await enqueueTicketStarted(client, {
          ticketId: ticket.id,
          reporterEmail: ticket.reporter_email,
          ticketNumber: ticket.ticket_number,
          ticketTitle: ticket.title,
          technicianName: user.fullName,
          startedAt: timer.startedAt,
        });
      }

      await client.query("COMMIT");

      response.status(timer.alreadyRunning ? 200 : 201).json({
        timer: {
          id: timer.id,
          startedAt: timer.startedAt,
        },
      });
    } catch (error) {
      await client.query("ROLLBACK");

      if ((error as { code?: string }).code === "23505") {
        response.status(409).json({
          error: "This ticket already has an active timer",
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
        job_card_id: string | null;
      }>(
        `SELECT id, job_card_id
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
        `UPDATE job_cards
         SET status = 'PAUSED', updated_at = CURRENT_TIMESTAMP
         WHERE status = 'LIVE'
           AND (id = $1 OR primary_ticket_id = $2)`,
        [timer.job_card_id, ticketId],
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

technicianRouter.patch(
  "/:ticketId/status",
  async (request, response) => {
    const user = (
      request as unknown as AuthenticatedRequest
    ).user;

    const { ticketId } = request.params;
    const parsed = updateStatusSchema.safeParse(request.body);

    if (!parsed.success) {
      response.status(400).json({
        error:
          parsed.error.issues[0]?.message ??
          "Invalid status update.",
      });
      return;
    }

    const { status } = parsed.data;

    const resolutionSummary =
      parsed.data.resolutionSummary?.trim() || null;

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const ticketResult = await client.query<{
        id: string;
        ticket_number: string;
        title: string;
        assigned_to: string | null;
        status: string;
        reporter_email: string;
        parent_ticket_id: string | null;
      }>(
        `SELECT
           tickets.id,
           tickets.ticket_number,
           tickets.title,
           tickets.assigned_to,
           tickets.status,
           tickets.parent_ticket_id,
           reporters.email AS reporter_email
         FROM tickets
         JOIN users AS reporters
           ON reporters.id = tickets.reporter_id
         WHERE tickets.id = $1
         FOR UPDATE OF tickets`,
        [ticketId],
      );

      const ticket = ticketResult.rows[0];

      if (!ticket) {
        await client.query("ROLLBACK");
        response.status(404).json({
          error: "Ticket not found.",
        });
        return;
      }

      if (ticket.assigned_to !== user.id) {
        await client.query("ROLLBACK");
        response.status(403).json({
          error:
            "Only the assigned technician can update this ticket.",
        });
        return;
      }

      if (ticket.status === "RESOLVED") {
        await client.query("ROLLBACK");
        response.status(409).json({
          error: "This ticket has already been resolved.",
        });
        return;
      }

      if (status === "RESOLVED" && !ticket.parent_ticket_id) {
        const unresolvedChildren = await client.query<{ count: number }>(
          `SELECT COUNT(*)::INTEGER AS count
           FROM tickets
           WHERE parent_ticket_id = $1
             AND status <> 'RESOLVED'`,
          [ticket.id],
        );
        if (Number(unresolvedChildren.rows[0]?.count ?? 0) > 0) {
          await client.query("ROLLBACK");
          response.status(409).json({
            error: "Resolve every sub-issue before resolving the parent ticket.",
          });
          return;
        }
      }

      if (status === "RESOLVED") {
        await client.query(
          `UPDATE time_entries
           SET stopped_at = GREATEST(
             CURRENT_TIMESTAMP,
             started_at + INTERVAL '1 millisecond'
           )
           WHERE ticket_id = $1
             AND stopped_at IS NULL`,
          [ticket.id],
        );
      }

      const updatedResult = await client.query<{
        id: string;
        ticket_number: string;
        status: string;
        resolution_summary: string | null;
        resolved_at: Date | null;
        updated_at: Date;
      }>(
        `UPDATE tickets
         SET
           status = $2::ticket_status,
           resolution_summary = CASE
             WHEN $2::ticket_status = 'RESOLVED'
               THEN $3
             ELSE resolution_summary
           END,
           resolved_at = CASE
             WHEN $2::ticket_status = 'RESOLVED'
               THEN CURRENT_TIMESTAMP
             ELSE NULL
           END,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING
           id,
           ticket_number,
           status,
           resolution_summary,
           resolved_at,
           updated_at`,
        [ticket.id, status, resolutionSummary],
      );

      const updatedTicket = updatedResult.rows[0];

      await client.query(
        `INSERT INTO audit_events (
           ticket_id,
           actor_id,
           action,
           previous_values,
           new_values
         )
         VALUES (
           $1,
           $2,
           'TICKET_STATUS_CHANGED',
           $3::jsonb,
           $4::jsonb
         )`,
        [
          ticket.id,
          user.id,
          JSON.stringify({
            status: ticket.status,
          }),
          JSON.stringify({
            status: updatedTicket.status,
            resolutionSummary:
              updatedTicket.resolution_summary,
            resolvedAt: updatedTicket.resolved_at,
          }),
        ],
      );

      if (ticket.parent_ticket_id && status === "RESOLVED") {
        await client.query(
          `INSERT INTO audit_events (ticket_id, actor_id, action, new_values)
           VALUES ($1, $2, 'SUB_ISSUE_RESOLVED', $3::jsonb)`,
          [
            ticket.parent_ticket_id,
            user.id,
            JSON.stringify({
              childTicketId: ticket.id,
              ticketNumber: ticket.ticket_number,
              resolutionSummary: updatedTicket.resolution_summary,
            }),
          ],
        );
      }

      const startedNow = status === "IN_PROGRESS" && ticket.status !== "IN_PROGRESS";

      if (startedNow) {
        await enqueueTicketStarted(client, {
          ticketId: ticket.id,
          reporterEmail: ticket.reporter_email,
          ticketNumber: ticket.ticket_number,
          ticketTitle: ticket.title,
          technicianName: user.fullName,
          startedAt: updatedTicket.updated_at,
        });
      } else {
        await client.query(
          `INSERT INTO notification_outbox (
           ticket_id,
           recipient_email,
           event_type,
           payload
         )
         VALUES ($1, $2, 'TICKET_STATUS_CHANGED', $3::jsonb)`,
          [
            ticket.id,
            ticket.reporter_email,
            JSON.stringify({
              ticketNumber: ticket.ticket_number,
              title: ticket.title,
              status: updatedTicket.status,
              resolutionSummary: updatedTicket.resolution_summary,
            }),
          ],
        );
      }

      await client.query("COMMIT");

      response.json({
        ticket: {
          id: updatedTicket.id,
          ticketNumber: updatedTicket.ticket_number,
          status: updatedTicket.status,
          resolutionSummary:
            updatedTicket.resolution_summary,
          resolvedAt: updatedTicket.resolved_at,
        },
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Ticket status update failed", error);

      response.status(500).json({
        error: "Ticket status update failed.",
      });
    } finally {
      client.release();
    }
  },
    );

technicianRouter.get("/reporters", async (request, response) => {
  const search = String(request.query.search ?? "").trim();

  try {
    const result = await pool.query(
      `SELECT
         id,
         full_name AS "fullName",
         email
       FROM users
       WHERE role = 'REPORTER'
         AND is_active = TRUE
         AND (
           $1 = ''
           OR full_name ILIKE '%' || $1 || '%'
           OR email ILIKE '%' || $1 || '%'
         )
       ORDER BY full_name
       LIMIT 50`,
      [search],
    );

    response.json({ reporters: result.rows });
  } catch (error) {
    console.error("Could not load reporters", error);
    response.status(500).json({ error: "Could not load reporters" });
  }
});

technicianRouter.post("/manual-tickets", async (request, response) => {
  const user = (request as unknown as AuthenticatedRequest).user;
  const parsed = manualTicketSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({
      error: parsed.error.issues[0]?.message ?? "Invalid ticket information",
    });
    return;
  }

  const input = parsed.data;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const reporterResult = await client.query<{
      id: string;
      email: string;
      full_name: string;
    }>(
      `SELECT id, email, full_name
       FROM users
       WHERE id = $1
         AND role = 'REPORTER'
         AND is_active = TRUE`,
      [input.reporterId],
    );
    const reporter = reporterResult.rows[0];

    if (!reporter) {
      await client.query("ROLLBACK");
      response.status(400).json({ error: "The selected reporter is unavailable" });
      return;
    }

    const categoryResult = await client.query<{ name: string }>(
      `SELECT name FROM categories WHERE id = $1 AND is_active = TRUE`,
      [input.categoryId],
    );
    const category = categoryResult.rows[0];

    if (!category) {
      await client.query("ROLLBACK");
      response.status(400).json({ error: "The selected category is unavailable" });
      return;
    }

    const priority = category.name === "Physical Hazard"
      ? "CRITICAL"
      : input.priority;
    const ticketResult = await client.query<{
      id: string;
      ticket_number: string;
      title: string;
      department: string | null;
      priority: string;
      status: string;
      created_at: Date;
    }>(
      `INSERT INTO tickets (
         reporter_id,
         created_by,
         category_id,
         department,
         location_id,
         location_details,
         station_reference,
         title,
         description,
         priority,
         source
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'WALK_IN')
       RETURNING id, ticket_number, title, department, priority, status, created_at`,
      [
        reporter.id,
        user.id,
        input.categoryId,
        input.department ?? null,
        input.locationId ?? null,
        input.locationDetails || null,
        input.stationReference || null,
        input.title,
        input.description,
        priority,
      ],
    );
    const ticket = ticketResult.rows[0];

    await client.query(
      `INSERT INTO audit_events (ticket_id, actor_id, action, new_values)
       VALUES ($1, $2, 'WALK_IN_TICKET_CREATED', $3::jsonb)`,
      [
        ticket.id,
        user.id,
        JSON.stringify({
          ticketNumber: ticket.ticket_number,
          reporterId: reporter.id,
          source: "WALK_IN",
          priority: ticket.priority,
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
       VALUES ($1, $2, 'TICKET_CREATED', $3::jsonb)`,
      [
        ticket.id,
        reporter.email,
        JSON.stringify({
          ticketNumber: ticket.ticket_number,
          title: ticket.title,
          reporterName: reporter.full_name,
          source: "WALK_IN",
        }),
      ],
    );

    await client.query("COMMIT");

    response.status(201).json({
      ticket: {
        id: ticket.id,
        ticketNumber: ticket.ticket_number,
        title: ticket.title,
        department: ticket.department,
        priority: ticket.priority,
        status: ticket.status,
        createdAt: ticket.created_at,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Walk-in ticket creation failed", error);
    response.status(500).json({ error: "Walk-in ticket creation failed" });
  } finally {
    client.release();
  }
});

technicianRouter.post("/:ticketId/escalate", async (request, response) => {
  const user = (request as unknown as AuthenticatedRequest).user;
  const parsed = escalationSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({
      error: parsed.error.issues[0]?.message ?? "Invalid escalation information",
    });
    return;
  }

  const { ticketId } = request.params;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const ticketResult = await client.query<{
      id: string;
      ticket_number: string;
      title: string;
      reporter_email: string;
      assigned_to: string | null;
      status: string;
    }>(
      `SELECT
         tickets.id,
         tickets.ticket_number,
         tickets.title,
         reporters.email AS reporter_email,
         tickets.assigned_to,
         tickets.status
       FROM tickets
       JOIN users AS reporters ON reporters.id = tickets.reporter_id
       WHERE tickets.id = $1
       FOR UPDATE OF tickets`,
      [ticketId],
    );
    const ticket = ticketResult.rows[0];

    if (!ticket) {
      await client.query("ROLLBACK");
      response.status(404).json({ error: "Ticket not found" });
      return;
    }

    const isAdministrator = user.role === "ADMIN" || user.role === "SYSTEM_ADMIN";

    if (!isAdministrator && ticket.assigned_to !== user.id) {
      await client.query("ROLLBACK");
      response.status(403).json({ error: "Claim this ticket before escalating it" });
      return;
    }

    if (ticket.status === "RESOLVED") {
      await client.query("ROLLBACK");
      response.status(409).json({ error: "A resolved ticket cannot be escalated" });
      return;
    }

    await client.query(
      `UPDATE time_entries
       SET stopped_at = GREATEST(
         CURRENT_TIMESTAMP,
         started_at + INTERVAL '1 millisecond'
       )
       WHERE ticket_id = $1
         AND stopped_at IS NULL`,
      [ticket.id],
    );

    const escalationResult = await client.query<{
      id: string;
      escalated_at: Date;
    }>(
      `INSERT INTO escalations (
         ticket_id,
         escalated_by,
         reason,
         external_reference
       )
       VALUES ($1, $2, $3, $4)
       RETURNING id, escalated_at`,
      [
        ticket.id,
        user.id,
        parsed.data.reason,
        parsed.data.externalReference || null,
      ],
    );
    const escalation = escalationResult.rows[0];

    await client.query(
      `UPDATE tickets
       SET status = 'ESCALATED', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [ticket.id],
    );

    await client.query(
      `INSERT INTO audit_events (ticket_id, actor_id, action, new_values)
       VALUES ($1, $2, 'TICKET_ESCALATED', $3::jsonb)`,
      [
        ticket.id,
        user.id,
        JSON.stringify({
          escalationId: escalation.id,
          reason: parsed.data.reason,
          externalReference: parsed.data.externalReference || null,
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
       VALUES ($1, $2, 'TICKET_ESCALATED', $3::jsonb)`,
      [
        ticket.id,
        ticket.reporter_email,
        JSON.stringify({
          ticketNumber: ticket.ticket_number,
          title: ticket.title,
          reason: parsed.data.reason,
          externalReference: parsed.data.externalReference || null,
        }),
      ],
    );

    await client.query("COMMIT");

    response.status(201).json({
      escalation: {
        id: escalation.id,
        ticketId: ticket.id,
        escalatedAt: escalation.escalated_at,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Ticket escalation failed", error);
    response.status(500).json({ error: "Ticket escalation failed" });
  } finally {
    client.release();
  }
});
