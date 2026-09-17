import { Router } from "express";
import { z } from "zod";

import { pool } from "../db.js";
import {
  requireAuth,
  requireRole,
  type AuthenticatedRequest,
} from "../middleware/require-auth.js";

export const calendarRouter = Router();

calendarRouter.use(
  requireAuth,
  requireRole("TECHNICIAN", "ADMIN", "SYSTEM_ADMIN"),
);

const eventSchema = z
  .object({
    title: z.string().trim().min(3).max(160),
    eventType: z.enum(["SLA", "SITE_VISIT", "MAINTENANCE", "FOLLOW_UP"]),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date().nullable().optional(),
    location: z.string().trim().max(200).optional(),
    notes: z.string().trim().max(2000).optional(),
    ticketId: z.string().uuid().nullable().optional(),
    assignedTo: z.string().uuid().nullable().optional(),
  })
  .superRefine((event, context) => {
    if (event.endsAt && event.endsAt <= event.startsAt) {
      context.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "End time must be after the start time",
      });
    }
  });

function currentUser(request: unknown) {
  return (request as AuthenticatedRequest).user;
}

calendarRouter.get("/", async (request, response) => {
  const from = String(request.query.from ?? "");
  const to = String(request.query.to ?? "");
  const parsedFrom = z.coerce.date().safeParse(from);
  const parsedTo = z.coerce.date().safeParse(to);
  const start = parsedFrom.success
    ? parsedFrom.data
    : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const end = parsedTo.success
    ? parsedTo.data
    : new Date(new Date().getFullYear(), new Date().getMonth() + 2, 1);

  try {
    const [events, staff, tickets] = await Promise.all([
      pool.query(
        `SELECT
           schedule_events.id,
           schedule_events.title,
           schedule_events.event_type AS "eventType",
           schedule_events.starts_at AS "startsAt",
           schedule_events.ends_at AS "endsAt",
           schedule_events.location,
           schedule_events.notes,
           schedule_events.ticket_id AS "ticketId",
           schedule_events.assigned_to AS "assignedTo",
           schedule_events.created_by AS "createdBy",
           assigned.full_name AS "assignedName",
           creators.full_name AS "createdByName",
           tickets.ticket_number AS "ticketNumber"
         FROM schedule_events
         JOIN users AS creators ON creators.id = schedule_events.created_by
         LEFT JOIN users AS assigned ON assigned.id = schedule_events.assigned_to
         LEFT JOIN tickets ON tickets.id = schedule_events.ticket_id
         WHERE schedule_events.starts_at >= $1
           AND schedule_events.starts_at < $2
         ORDER BY schedule_events.starts_at`,
        [start, end],
      ),
      pool.query(
        `SELECT id, full_name AS "fullName", role
         FROM users
         WHERE role IN ('TECHNICIAN', 'ADMIN', 'SYSTEM_ADMIN')
           AND is_active = TRUE
         ORDER BY full_name`,
      ),
      pool.query(
        `SELECT id, ticket_number AS "ticketNumber", title
         FROM tickets
         WHERE status <> 'RESOLVED'
         ORDER BY created_at DESC
         LIMIT 100`,
      ),
    ]);

    response.json({
      events: events.rows,
      staff: staff.rows,
      tickets: tickets.rows,
    });
  } catch (error) {
    console.error("Could not load service calendar", error);
    response.status(500).json({ error: "Could not load service calendar" });
  }
});

calendarRouter.post("/", async (request, response) => {
  const user = currentUser(request);
  const parsed = eventSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({
      error: parsed.error.issues[0]?.message ?? "Invalid schedule event",
    });
    return;
  }

  const input = parsed.data;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query<{
      id: string;
      title: string;
      event_type: string;
      starts_at: Date;
      ends_at: Date | null;
      location: string | null;
      notes: string | null;
      ticket_id: string | null;
      assigned_to: string | null;
    }>(
      `INSERT INTO schedule_events (
         title,
         event_type,
         starts_at,
         ends_at,
         location,
         notes,
         ticket_id,
         assigned_to,
         created_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING
         id,
         title,
         event_type,
         starts_at,
         ends_at,
         location,
         notes,
         ticket_id,
         assigned_to`,
      [
        input.title,
        input.eventType,
        input.startsAt,
        input.endsAt ?? null,
        input.location || null,
        input.notes || null,
        input.ticketId ?? null,
        input.assignedTo ?? user.id,
        user.id,
      ],
    );
    const event = result.rows[0];

    await client.query(
      `INSERT INTO audit_events (ticket_id, actor_id, action, new_values)
       VALUES ($1, $2, 'SCHEDULE_EVENT_CREATED', $3::jsonb)`,
      [
        event.ticket_id,
        user.id,
        JSON.stringify({
          scheduleEventId: event.id,
          title: event.title,
          eventType: event.event_type,
          startsAt: event.starts_at,
          assignedTo: event.assigned_to,
        }),
      ],
    );

    await client.query("COMMIT");

    response.status(201).json({
      event: {
        id: event.id,
        title: event.title,
        eventType: event.event_type,
        startsAt: event.starts_at,
        endsAt: event.ends_at,
        location: event.location,
        notes: event.notes,
        ticketId: event.ticket_id,
        assignedTo: event.assigned_to,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Schedule event creation failed", error);
    response.status(500).json({ error: "Schedule event creation failed" });
  } finally {
    client.release();
  }
});

calendarRouter.delete("/:eventId", async (request, response) => {
  const user = currentUser(request);
  const parsedId = z.string().uuid().safeParse(request.params.eventId);

  if (!parsedId.success) {
    response.status(400).json({ error: "Invalid schedule event" });
    return;
  }

  try {
    const result = await pool.query<{ id: string; created_by: string }>(
      `DELETE FROM schedule_events
       WHERE id = $1
         AND (
           created_by = $2
           OR $3::user_role IN ('ADMIN', 'SYSTEM_ADMIN')
         )
       RETURNING id, created_by`,
      [parsedId.data, user.id, user.role],
    );

    if (!result.rows[0]) {
      response.status(404).json({ error: "Schedule event not found or not permitted" });
      return;
    }

    await pool.query(
      `INSERT INTO audit_events (actor_id, action, previous_values)
       VALUES ($1, 'SCHEDULE_EVENT_DELETED', $2::jsonb)`,
      [user.id, JSON.stringify({ scheduleEventId: parsedId.data })],
    );

    response.status(204).send();
  } catch (error) {
    console.error("Schedule event deletion failed", error);
    response.status(500).json({ error: "Schedule event deletion failed" });
  }
});
