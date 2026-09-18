import { Router } from "express";
import { z } from "zod";

import { pool } from "../db.js";
import {
  requireAuth,
  requireRole,
  type AuthenticatedRequest,
  type AuthenticatedUser,
} from "../middleware/require-auth.js";
import { enqueueTicketStarted } from "../services/notification-outbox.js";

export const jobCardsRouter = Router();
jobCardsRouter.use(
  requireAuth,
  requireRole("TECHNICIAN", "ADMIN", "SYSTEM_ADMIN"),
);

const idSchema = z.string().uuid();
const prioritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const optionalEmailSchema = z
  .union([
    z.literal(""),
    z
      .string()
      .trim()
      .email()
      .max(255)
      .refine((email) => email.toLowerCase().endsWith("@mynwu.ac.za"), {
        message: "Use a valid @mynwu.ac.za email address",
      }),
  ])
  .nullable()
  .optional()
  .transform((email) => email || null);

const createSchema = z
  .object({
    title: z.string().trim().min(5).max(160),
    description: z.string().trim().min(10).max(4000),
    primaryTicketId: z.string().uuid().nullable().optional(),
    relatedTicketIds: z.array(z.string().uuid()).max(20).default([]),
    assignedTo: z.string().uuid(),
    categoryId: z.number().int().positive(),
    priority: prioritySchema.default("MEDIUM"),
    locationId: z.number().int().positive().nullable().optional(),
    locationDetails: z.string().trim().max(200).optional(),
    stationReference: z.string().trim().max(80).optional(),
    scheduledAt: z.coerce.date().nullable().optional(),
    targetAt: z.coerce.date().nullable().optional(),
    checklist: z.array(z.string().trim().min(1).max(300)).max(30).default([]),
    internalNotes: z.string().trim().max(4000).optional(),
    walkInReporterName: z.string().trim().min(2).max(120).nullable().optional(),
    walkInReporterEmail: optionalEmailSchema,
  })
  .superRefine((input, context) => {
    if (!input.primaryTicketId && !input.walkInReporterName) {
      context.addIssue({
        code: "custom",
        path: ["walkInReporterName"],
        message: "Enter the walk-in requester's name when no ticket is selected",
      });
    }
  });

type ManagedJobCard = {
  id: string;
  primary_ticket_id: string | null;
  assigned_to: string;
  status: string;
  ticket_number: string | null;
  ticket_title: string | null;
  ticket_status: string | null;
  reporter_email: string | null;
  technician_name: string;
};

function user(request: unknown) {
  return (request as AuthenticatedRequest).user;
}

function isAdmin(actor: AuthenticatedUser) {
  return actor.role === "ADMIN" || actor.role === "SYSTEM_ADMIN";
}

jobCardsRouter.get("/summary", async (request, response) => {
  const actor = user(request);
  const values = isAdmin(actor) ? [] : [actor.id];
  const filter = isAdmin(actor) ? "" : "WHERE assigned_to = $1";
  const result = await pool.query(
    `SELECT COUNT(*) FILTER (
       WHERE status IN ('SCHEDULED', 'LIVE', 'PAUSED')
     )::INTEGER AS active
     FROM job_cards ${filter}`,
    values,
  );
  response.json(result.rows[0]);
});

jobCardsRouter.get("/options", async (_request, response) => {
  const [tickets, technicians, categories, locations] = await Promise.all([
    pool.query(
      `SELECT
         tickets.id,
         tickets.ticket_number AS "ticketNumber",
         tickets.title,
         tickets.description,
         tickets.priority,
         tickets.category_id AS "categoryId",
         tickets.location_id AS "locationId",
         tickets.location_details AS "locationDetails",
         tickets.station_reference AS "stationReference",
         tickets.assigned_to AS "assignedTo",
         reporters.full_name AS "reporterName",
         reporters.email AS "reporterEmail"
       FROM tickets
       JOIN users AS reporters ON reporters.id = tickets.reporter_id
       WHERE tickets.status <> 'RESOLVED'
       ORDER BY tickets.created_at DESC
       LIMIT 200`,
    ),
    pool.query(
      `SELECT id, full_name AS "fullName", role
       FROM users
       WHERE role = 'TECHNICIAN' AND is_active = TRUE
       ORDER BY full_name`,
    ),
    pool.query(
      `SELECT id, name FROM categories WHERE is_active = TRUE ORDER BY name`,
    ),
    pool.query(
      `SELECT id, name FROM locations WHERE is_active = TRUE ORDER BY name`,
    ),
  ]);

  response.json({
    tickets: tickets.rows,
    technicians: technicians.rows,
    categories: categories.rows,
    locations: locations.rows,
  });
});

jobCardsRouter.get("/", async (request, response) => {
  const actor = user(request);
  const search = String(request.query.search ?? "");
  const status = String(request.query.status ?? "ALL");
  const result = await pool.query(
    `SELECT
       jc.id,
       jc.job_number AS "jobNumber",
       jc.title,
       jc.description,
       jc.status,
       jc.scheduled_at AS "scheduledAt",
       jc.target_at AS "targetAt",
       jc.created_at AS "createdAt",
       jc.updated_at AS "updatedAt",
       t.id AS "ticketId",
       t.ticket_number AS "ticketNumber",
       t.title AS "ticketTitle",
       COALESCE(t.priority, jc.priority)::text AS priority,
       c.name AS category,
       u.id AS "technicianId",
       u.full_name AS "technicianName",
       u.role AS "technicianRole",
       COALESCE(r.full_name, jc.walk_in_reporter_name, 'Walk-in requester') AS "reporterName",
       COALESCE(r.email, jc.walk_in_reporter_email) AS "reporterEmail",
       (jc.primary_ticket_id IS NULL) AS "isWalkIn",
       COALESCE(te.total, 0)::INTEGER AS "totalSeconds",
       te.active AS "activeTimerStartedAt",
       COALESCE(jc.location_details, l.name) AS location,
       jc.station_reference AS "stationReference"
     FROM job_cards AS jc
     LEFT JOIN tickets AS t ON t.id = jc.primary_ticket_id
     LEFT JOIN users AS r ON r.id = t.reporter_id
     JOIN users AS u ON u.id = jc.assigned_to
     JOIN categories AS c ON c.id = jc.category_id
     LEFT JOIN locations AS l ON l.id = jc.location_id
     LEFT JOIN LATERAL (
       SELECT
         SUM(EXTRACT(EPOCH FROM (stopped_at - started_at)))
           FILTER (WHERE stopped_at IS NOT NULL) AS total,
         MAX(started_at) FILTER (WHERE stopped_at IS NULL) AS active
       FROM time_entries
       WHERE job_card_id = jc.id
     ) AS te ON TRUE
     WHERE ($1 OR jc.assigned_to = $2)
       AND ($3 = 'ALL' OR jc.status::text = $3)
       AND (
         $4 = ''
         OR jc.job_number ILIKE '%' || $4 || '%'
         OR jc.title ILIKE '%' || $4 || '%'
         OR COALESCE(t.ticket_number, '') ILIKE '%' || $4 || '%'
         OR COALESCE(r.full_name, jc.walk_in_reporter_name, '') ILIKE '%' || $4 || '%'
       )
     ORDER BY
       CASE jc.status
         WHEN 'LIVE' THEN 1
         WHEN 'PAUSED' THEN 2
         WHEN 'SCHEDULED' THEN 3
         ELSE 4
       END,
       jc.target_at NULLS LAST`,
    [isAdmin(actor), actor.id, status, search],
  );

  response.json({ jobCards: result.rows });
});

jobCardsRouter.post("/", async (request, response) => {
  const parsed = createSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      error: "Invalid job-card information",
      details: parsed.error.issues,
    });
    return;
  }

  const actor = user(request);
  const input = parsed.data;
  const primaryTicketId = input.primaryTicketId ?? null;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    if (primaryTicketId) {
      const linked = await client.query(
        `SELECT id FROM tickets WHERE id = $1 AND status <> 'RESOLVED'`,
        [primaryTicketId],
      );
      if (!linked.rows[0]) {
        await client.query("ROLLBACK");
        response.status(400).json({ error: "Primary ticket was not found or is resolved" });
        return;
      }
    }

    const created = await client.query<{ id: string; job_number: string }>(
      `INSERT INTO job_cards (
         primary_ticket_id, assigned_to, created_by, title, description,
         category_id, priority, location_id, location_details,
         station_reference, scheduled_at, target_at,
         walk_in_reporter_name, walk_in_reporter_email
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING id, job_number`,
      [
        primaryTicketId,
        input.assignedTo,
        actor.id,
        input.title,
        input.description,
        input.categoryId,
        input.priority,
        input.locationId ?? null,
        input.locationDetails || null,
        input.stationReference || null,
        input.scheduledAt ?? null,
        input.targetAt ?? null,
        primaryTicketId ? null : input.walkInReporterName,
        primaryTicketId ? null : input.walkInReporterEmail,
      ],
    );
    const card = created.rows[0];

    for (const ticketId of [
      ...new Set(input.relatedTicketIds.filter((id) => id !== primaryTicketId)),
    ]) {
      await client.query(
        `INSERT INTO job_card_related_tickets (job_card_id, ticket_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [card.id, ticketId],
      );
    }

    for (const [position, body] of input.checklist.entries()) {
      await client.query(
        `INSERT INTO job_card_checklist_items (job_card_id, body, position)
         VALUES ($1, $2, $3)`,
        [card.id, body, position],
      );
    }

    if (input.internalNotes) {
      await client.query(
        `INSERT INTO job_card_notes (job_card_id, author_id, body)
         VALUES ($1, $2, $3)`,
        [card.id, actor.id, input.internalNotes],
      );
    }

    await client.query(
      `INSERT INTO audit_events (ticket_id, actor_id, action, new_values)
       VALUES ($1, $2, 'JOB_CARD_CREATED', $3::jsonb)`,
      [
        primaryTicketId,
        actor.id,
        JSON.stringify({
          jobCardId: card.id,
          jobNumber: card.job_number,
          assignedTo: input.assignedTo,
          source: primaryTicketId ? "TICKET" : "WALK_IN",
          walkInReporterName: primaryTicketId ? undefined : input.walkInReporterName,
        }),
      ],
    );

    await client.query("COMMIT");
    response.status(201).json({
      jobCard: {
        id: card.id,
        jobNumber: card.job_number,
        source: primaryTicketId ? "TICKET" : "WALK_IN",
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Job card creation failed", error);
    response.status(500).json({ error: "Job card creation failed" });
  } finally {
    client.release();
  }
});

async function loadManaged(id: string, actor: AuthenticatedUser) {
  const result = await pool.query<ManagedJobCard>(
    `SELECT
       jc.id, jc.primary_ticket_id, jc.assigned_to, jc.status,
       t.ticket_number, t.title AS ticket_title, t.status::text AS ticket_status,
       r.email AS reporter_email, u.full_name AS technician_name
     FROM job_cards AS jc
     LEFT JOIN tickets AS t ON t.id = jc.primary_ticket_id
     LEFT JOIN users AS r ON r.id = t.reporter_id
     JOIN users AS u ON u.id = jc.assigned_to
     WHERE jc.id = $1`,
    [id],
  );
  const card = result.rows[0];
  return card && (isAdmin(actor) || card.assigned_to === actor.id) ? card : null;
}

jobCardsRouter.post("/:id/timer/:action", async (request, response) => {
  const parsed = idSchema.safeParse(request.params.id);
  const action = request.params.action;
  if (!parsed.success || !["start", "pause", "resume"].includes(action)) {
    response.status(400).json({ error: "Invalid timer action" });
    return;
  }

  const actor = user(request);
  const card = await loadManaged(parsed.data, actor);
  if (!card) {
    response.status(403).json({
      error: "Only the assigned technician or an administrator can manage this job card",
    });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (action === "pause") {
      const stopped = await client.query(
        `UPDATE time_entries
         SET stopped_at = CURRENT_TIMESTAMP
         WHERE job_card_id = $1 AND stopped_at IS NULL
         RETURNING id`,
        [card.id],
      );
      if (!stopped.rowCount) {
        await client.query("ROLLBACK");
        response.status(409).json({ error: "This job card has no live timer" });
        return;
      }
      await client.query(
        `UPDATE job_cards
         SET status = 'PAUSED', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [card.id],
      );
    } else {
      const timer = await client.query<{ started_at: Date }>(
        `INSERT INTO time_entries (ticket_id, technician_id, job_card_id)
         VALUES ($1, $2, $3)
         RETURNING started_at`,
        [card.primary_ticket_id, card.assigned_to, card.id],
      );
      await client.query(
        `UPDATE job_cards
         SET status = 'LIVE', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [card.id],
      );

      if (
        action === "start" &&
        card.primary_ticket_id &&
        card.ticket_status !== "IN_PROGRESS"
      ) {
        await client.query(
          `UPDATE tickets
           SET status = 'IN_PROGRESS', updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [card.primary_ticket_id],
        );
        if (card.reporter_email && card.ticket_number && card.ticket_title) {
          await enqueueTicketStarted(client, {
            ticketId: card.primary_ticket_id,
            reporterEmail: card.reporter_email,
            ticketNumber: card.ticket_number,
            ticketTitle: card.ticket_title,
            technicianName: card.technician_name,
            startedAt: timer.rows[0].started_at,
          });
        }
      }
    }

    await client.query(
      `INSERT INTO audit_events (ticket_id, actor_id, action, new_values)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [
        card.primary_ticket_id,
        actor.id,
        `JOB_CARD_TIMER_${action.toUpperCase()}`,
        JSON.stringify({ jobCardId: card.id }),
      ],
    );
    await client.query("COMMIT");
    response.json({ ok: true });
  } catch (error) {
    await client.query("ROLLBACK");
    if ((error as { code?: string }).code === "23505") {
      response.status(409).json({
        error: "This technician or ticket already has a live timer",
      });
      return;
    }
    response.status(500).json({ error: "Timer action failed" });
  } finally {
    client.release();
  }
});

jobCardsRouter.post("/:id/complete", async (request, response) => {
  const parsed = idSchema.safeParse(request.params.id);
  const note = z.string().trim().min(5).max(2000).safeParse(request.body?.completionNote);
  if (!parsed.success || !note.success) {
    response.status(400).json({
      error: "A completion note of at least 5 characters is required",
    });
    return;
  }
  const actor = user(request);
  const card = await loadManaged(parsed.data, actor);
  if (!card) {
    response.status(403).json({ error: "You cannot complete this job card" });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE time_entries
       SET stopped_at = CURRENT_TIMESTAMP
       WHERE job_card_id = $1 AND stopped_at IS NULL`,
      [card.id],
    );
    await client.query(
      `UPDATE job_cards
       SET status = 'COMPLETED', completion_note = $2,
           completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [card.id, note.data],
    );
    await client.query(
      `INSERT INTO audit_events (ticket_id, actor_id, action, new_values)
       VALUES ($1, $2, 'JOB_CARD_COMPLETED', $3::jsonb)`,
      [
        card.primary_ticket_id,
        actor.id,
        JSON.stringify({ jobCardId: card.id, completionNote: note.data }),
      ],
    );
    await client.query("COMMIT");
    response.json({ ok: true });
  } catch {
    await client.query("ROLLBACK");
    response.status(500).json({ error: "Could not complete job card" });
  } finally {
    client.release();
  }
});

jobCardsRouter.patch("/:id/checklist/:itemId", async (request, response) => {
  const id = idSchema.safeParse(request.params.id);
  const item = idSchema.safeParse(request.params.itemId);
  if (!id.success || !item.success) {
    response.status(400).json({ error: "Invalid checklist item" });
    return;
  }
  const actor = user(request);
  const card = await loadManaged(id.data, actor);
  if (!card) {
    response.status(403).json({ error: "You cannot update this job card" });
    return;
  }

  await pool.query(
    `UPDATE job_card_checklist_items
     SET is_complete = $3, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND job_card_id = $2`,
    [item.data, card.id, Boolean(request.body?.isComplete)],
  );
  await pool.query(
    `INSERT INTO audit_events (ticket_id, actor_id, action, new_values)
     VALUES ($1, $2, 'JOB_CARD_CHECKLIST_UPDATED', $3::jsonb)`,
    [
      card.primary_ticket_id,
      actor.id,
      JSON.stringify({
        jobCardId: card.id,
        itemId: item.data,
        isComplete: Boolean(request.body?.isComplete),
      }),
    ],
  );
  response.json({ ok: true });
});

jobCardsRouter.post("/:id/notes", async (request, response) => {
  const id = idSchema.safeParse(request.params.id);
  const body = z.string().trim().min(1).max(4000).safeParse(request.body?.body);
  if (!id.success || !body.success) {
    response.status(400).json({ error: "A work note is required" });
    return;
  }
  const actor = user(request);
  const card = await loadManaged(id.data, actor);
  if (!card) {
    response.status(403).json({ error: "You cannot update this job card" });
    return;
  }

  await pool.query(
    `INSERT INTO job_card_notes (job_card_id, author_id, body)
     VALUES ($1, $2, $3)`,
    [card.id, actor.id, body.data],
  );
  await pool.query(
    `INSERT INTO audit_events (ticket_id, actor_id, action, new_values)
     VALUES ($1, $2, 'JOB_CARD_NOTE_ADDED', $3::jsonb)`,
    [card.primary_ticket_id, actor.id, JSON.stringify({ jobCardId: card.id })],
  );
  response.status(201).json({ ok: true });
});

jobCardsRouter.get("/:id", async (request, response) => {
  const id = idSchema.safeParse(request.params.id);
  if (!id.success) {
    response.status(400).json({ error: "Invalid job card" });
    return;
  }
  const actor = user(request);
  const base = await pool.query(
    `SELECT
       jc.id, jc.job_number AS "jobNumber", jc.title, jc.description,
       jc.status, jc.scheduled_at AS "scheduledAt", jc.target_at AS "targetAt",
       jc.created_at AS "createdAt", jc.updated_at AS "updatedAt",
       jc.station_reference AS "stationReference",
       t.id AS "ticketId", t.ticket_number AS "ticketNumber", t.title AS "ticketTitle",
       COALESCE(t.priority, jc.priority)::text AS priority,
       COALESCE(r.full_name, jc.walk_in_reporter_name, 'Walk-in requester') AS "reporterName",
       COALESCE(r.email, jc.walk_in_reporter_email) AS "reporterEmail",
       (jc.primary_ticket_id IS NULL) AS "isWalkIn",
       u.id AS "technicianId", u.full_name AS "technicianName",
       u.role AS "technicianRole", c.name AS category,
       COALESCE(jc.location_details, l.name) AS location
     FROM job_cards AS jc
     LEFT JOIN tickets AS t ON t.id = jc.primary_ticket_id
     LEFT JOIN users AS r ON r.id = t.reporter_id
     JOIN users AS u ON u.id = jc.assigned_to
     JOIN categories AS c ON c.id = jc.category_id
     LEFT JOIN locations AS l ON l.id = jc.location_id
     WHERE jc.id = $1 AND ($2 OR jc.assigned_to = $3)`,
    [id.data, isAdmin(actor), actor.id],
  );
  if (!base.rows[0]) {
    response.status(404).json({ error: "Job card not found" });
    return;
  }

  const [checklist, notes, timeEntries, history] = await Promise.all([
    pool.query(
      `SELECT id, body, is_complete AS "isComplete", position
       FROM job_card_checklist_items
       WHERE job_card_id = $1 ORDER BY position`,
      [id.data],
    ),
    pool.query(
      `SELECT n.id, n.body, n.created_at AS "createdAt", u.full_name AS "authorName"
       FROM job_card_notes AS n
       JOIN users AS u ON u.id = n.author_id
       WHERE n.job_card_id = $1 ORDER BY n.created_at DESC`,
      [id.data],
    ),
    pool.query(
      `SELECT id, started_at AS "startedAt", stopped_at AS "stoppedAt",
              EXTRACT(EPOCH FROM (COALESCE(stopped_at, CURRENT_TIMESTAMP) - started_at))::INTEGER AS "durationSeconds"
       FROM time_entries
       WHERE job_card_id = $1 ORDER BY started_at DESC`,
      [id.data],
    ),
    pool.query(
      `SELECT a.id, a.action, a.created_at AS "createdAt", u.full_name AS "actorName"
       FROM audit_events AS a
       LEFT JOIN users AS u ON u.id = a.actor_id
       WHERE a.new_values ->> 'jobCardId' = $1 ORDER BY a.created_at DESC`,
      [id.data],
    ),
  ]);

  response.json({
    jobCard: {
      ...base.rows[0],
      checklist: checklist.rows,
      notes: notes.rows,
      timeEntries: timeEntries.rows,
      history: history.rows,
    },
  });
});
