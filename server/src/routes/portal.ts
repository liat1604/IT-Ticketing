import { Router } from "express";
import { z } from "zod";

import { pool } from "../db.js";
import {
  requireAuth,
  type AuthenticatedRequest,
} from "../middleware/require-auth.js";

export const portalRouter = Router();

portalRouter.use(requireAuth);

const ticketIdSchema = z.string().uuid();
const commentSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  visibility: z.enum(["PUBLIC", "INTERNAL"]).default("PUBLIC"),
});
const subIssueSchema = z.object({
  title: z.string().trim().min(5).max(160),
  description: z.string().trim().min(10).max(4000),
  categoryId: z.number().int().positive().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  assignedTo: z.string().uuid().nullable().optional(),
  dueAt: z.coerce.date().nullable().optional(),
});

function currentUser(request: unknown) {
  return (request as AuthenticatedRequest).user;
}

portalRouter.get("/sub-issue-options", async (request, response) => {
  const user = currentUser(request);
  if (user.role === "REPORTER") {
    response.status(403).json({ error: "Only support staff can create sub-issues" });
    return;
  }

  try {
    const [categories, technicians] = await Promise.all([
      pool.query(`SELECT id, name FROM categories WHERE is_active = TRUE ORDER BY name`),
      pool.query(
        `SELECT id, full_name AS "fullName", role
         FROM users
         WHERE role = 'TECHNICIAN'
           AND is_active = TRUE
         ORDER BY full_name`,
      ),
    ]);
    response.json({ categories: categories.rows, technicians: technicians.rows });
  } catch (error) {
    console.error("Could not load sub-issue options", error);
    response.status(500).json({ error: "Could not load sub-issue options" });
  }
});

portalRouter.get("/tickets/mine", async (request, response) => {
  const user = currentUser(request);

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
         tickets.resolution_summary AS "resolutionSummary",
         tickets.resolved_at AS "resolvedAt",
         tickets.parent_ticket_id AS "parentTicketId",
         tickets.due_at AS "dueAt",
         tickets.created_at AS "createdAt",
         tickets.updated_at AS "updatedAt",
         categories.name AS category,
         technicians.full_name AS "technicianName",
         parent.ticket_number AS "parentTicketNumber",
         COUNT(comments.id)::INTEGER AS "commentCount"
       FROM tickets
       JOIN categories ON categories.id = tickets.category_id
       LEFT JOIN users AS technicians ON technicians.id = tickets.assigned_to
       LEFT JOIN tickets AS parent ON parent.id = tickets.parent_ticket_id
       LEFT JOIN comments
         ON comments.ticket_id = tickets.id
        AND comments.visibility = 'PUBLIC'
       WHERE tickets.reporter_id = $1
         AND tickets.parent_ticket_id IS NULL
       GROUP BY tickets.id, categories.name, technicians.full_name, parent.ticket_number
       ORDER BY tickets.created_at DESC`,
      [user.id],
    );

    response.json({ tickets: result.rows });
  } catch (error) {
    console.error("Could not load reporter tickets", error);
    response.status(500).json({ error: "Could not load reporter tickets" });
  }
});

portalRouter.get("/tickets/:ticketId", async (request, response) => {
  const parsedId = ticketIdSchema.safeParse(request.params.ticketId);

  if (!parsedId.success) {
    response.status(400).json({ error: "Invalid ticket identifier" });
    return;
  }

  const user = currentUser(request);

  try {
    const ticketResult = await pool.query<{
      id: string;
      reporterId: string;
      [key: string]: unknown;
    }>(
      `SELECT
         tickets.id,
         tickets.ticket_number AS "ticketNumber",
         tickets.reporter_id AS "reporterId",
         tickets.assigned_to AS "technicianId",
         tickets.title,
         tickets.description,
         tickets.priority,
         tickets.department,
         tickets.status,
         tickets.source,
         tickets.location_details AS "locationDetails",
         tickets.station_reference AS "stationReference",
         tickets.resolution_summary AS "resolutionSummary",
         tickets.resolved_at AS "resolvedAt",
         tickets.parent_ticket_id AS "parentTicketId",
         tickets.due_at AS "dueAt",
         tickets.created_at AS "createdAt",
         tickets.updated_at AS "updatedAt",
         categories.name AS category,
         reporters.full_name AS "reporterName",
         reporters.email AS "reporterEmail",
         technicians.full_name AS "technicianName",
         parent.ticket_number AS "parentTicketNumber",
         parent.title AS "parentTicketTitle"
       FROM tickets
       JOIN categories ON categories.id = tickets.category_id
       JOIN users AS reporters ON reporters.id = tickets.reporter_id
       LEFT JOIN users AS technicians ON technicians.id = tickets.assigned_to
       LEFT JOIN tickets AS parent ON parent.id = tickets.parent_ticket_id
       WHERE tickets.id = $1`,
      [parsedId.data],
    );
    const ticket = ticketResult.rows[0];

    if (!ticket) {
      response.status(404).json({ error: "Ticket not found" });
      return;
    }

    if (user.role === "REPORTER" && ticket.reporterId !== user.id) {
      response.status(403).json({ error: "You cannot view this ticket" });
      return;
    }

    const internalFilter = user.role === "REPORTER"
      ? "AND comments.visibility = 'PUBLIC'"
      : "";
    const auditFilter = user.role === "REPORTER"
      ? `AND audit_events.action IN (
           'TICKET_CREATED',
           'TICKET_CLAIMED',
           'TICKET_STATUS_CHANGED',
           'TICKET_ESCALATED',
           'COMMENT_ADDED',
           'SUB_ISSUE_CREATED',
           'SUB_ISSUE_RESOLVED'
         )`
      : "";

    const [comments, timeEntries, escalations, auditEvents, subIssues] = await Promise.all([
      pool.query(
        `SELECT
           comments.id,
           comments.body,
           comments.visibility,
           comments.created_at AS "createdAt",
           users.id AS "authorId",
           users.full_name AS "authorName",
           users.role AS "authorRole"
         FROM comments
         JOIN users ON users.id = comments.author_id
         WHERE comments.ticket_id = $1
         ${internalFilter}
         ORDER BY comments.created_at ASC`,
        [ticket.id],
      ),
      pool.query(
        `SELECT
           time_entries.id,
           time_entries.started_at AS "startedAt",
           time_entries.stopped_at AS "stoppedAt",
           EXTRACT(EPOCH FROM (
             COALESCE(time_entries.stopped_at, CURRENT_TIMESTAMP)
             - time_entries.started_at
           ))::INTEGER AS "durationSeconds",
           users.full_name AS "technicianName"
         FROM time_entries
         JOIN users ON users.id = time_entries.technician_id
         WHERE time_entries.ticket_id = $1
         ORDER BY time_entries.started_at DESC`,
        [ticket.id],
      ),
      pool.query(
        `SELECT
           escalations.id,
           escalations.reason,
           escalations.external_reference AS "externalReference",
           escalations.escalated_at AS "escalatedAt",
           escalations.resolved_at AS "resolvedAt",
           users.full_name AS "escalatedBy"
         FROM escalations
         JOIN users ON users.id = escalations.escalated_by
         WHERE escalations.ticket_id = $1
         ORDER BY escalations.escalated_at DESC`,
        [ticket.id],
      ),
      pool.query(
        `SELECT
           audit_events.id,
           audit_events.action,
           audit_events.new_values AS "newValues",
           audit_events.created_at AS "createdAt",
           users.full_name AS "actorName"
         FROM audit_events
         LEFT JOIN users ON users.id = audit_events.actor_id
         WHERE audit_events.ticket_id = $1
         ${auditFilter}
         ORDER BY audit_events.created_at DESC`,
        [ticket.id],
      ),
      pool.query(
        `SELECT
           children.id,
           children.ticket_number AS "ticketNumber",
           children.title,
           children.description,
           children.priority,
           children.status,
           children.due_at AS "dueAt",
           children.created_at AS "createdAt",
           categories.name AS category,
           technicians.full_name AS "technicianName",
           COALESCE((
             SELECT SUM(EXTRACT(EPOCH FROM (
               COALESCE(time_entries.stopped_at, CURRENT_TIMESTAMP)
               - time_entries.started_at
             )))::INTEGER
             FROM time_entries
             WHERE time_entries.ticket_id = children.id
           ), 0) AS "recordedSeconds"
         FROM tickets AS children
         JOIN categories ON categories.id = children.category_id
         LEFT JOIN users AS technicians ON technicians.id = children.assigned_to
         WHERE children.parent_ticket_id = $1
         ORDER BY
           CASE children.status
             WHEN 'IN_PROGRESS' THEN 1
             WHEN 'ASSIGNED' THEN 2
             WHEN 'NEW' THEN 3
             WHEN 'AWAITING_FEEDBACK' THEN 4
             WHEN 'ESCALATED' THEN 5
             WHEN 'RESOLVED' THEN 6
           END,
           children.created_at`,
        [ticket.id],
      ),
    ]);

    response.json({
      ticket,
      comments: comments.rows,
      timeEntries: timeEntries.rows,
      escalations: escalations.rows,
      auditEvents: auditEvents.rows,
      subIssues: subIssues.rows,
    });
  } catch (error) {
    console.error("Could not load ticket detail", error);
    response.status(500).json({ error: "Could not load ticket detail" });
  }
});

portalRouter.post("/tickets/:ticketId/sub-issues", async (request, response) => {
  const parsedId = ticketIdSchema.safeParse(request.params.ticketId);
  const parsed = subIssueSchema.safeParse(request.body);
  if (!parsedId.success || !parsed.success) {
    response.status(400).json({
      error: parsed.success ? "Invalid parent ticket" : parsed.error.issues[0]?.message ?? "Invalid sub-issue",
    });
    return;
  }

  const user = currentUser(request);
  if (user.role === "REPORTER") {
    response.status(403).json({ error: "Only support staff can create sub-issues" });
    return;
  }

  const input = parsed.data;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const parentResult = await client.query<{
      id: string; ticket_number: string; title: string; reporter_id: string;
      reporter_email: string; assigned_to: string | null; category_id: number;
      department: string | null;
      location_id: number | null; location_details: string | null; status: string;
      parent_ticket_id: string | null; source: string;
    }>(
      `SELECT tickets.id, tickets.ticket_number, tickets.title, tickets.reporter_id,
              reporters.email AS reporter_email, tickets.assigned_to, tickets.category_id,
              tickets.department,
              tickets.location_id, tickets.location_details, tickets.status,
              tickets.parent_ticket_id, tickets.source
       FROM tickets
       JOIN users AS reporters ON reporters.id = tickets.reporter_id
       WHERE tickets.id = $1
       FOR UPDATE OF tickets`,
      [parsedId.data],
    );
    const parent = parentResult.rows[0];
    if (!parent) {
      await client.query("ROLLBACK");
      response.status(404).json({ error: "Parent ticket not found" });
      return;
    }
    if (parent.parent_ticket_id) {
      await client.query("ROLLBACK");
      response.status(409).json({ error: "Sub-issues can only be added to a top-level ticket" });
      return;
    }
    if (parent.status === "RESOLVED") {
      await client.query("ROLLBACK");
      response.status(409).json({ error: "Resolved tickets cannot receive new sub-issues" });
      return;
    }

    if (input.assignedTo) {
      const assignee = await client.query(
        `SELECT id FROM users
         WHERE id = $1 AND is_active = TRUE
           AND role IN ('TECHNICIAN', 'ADMIN', 'SYSTEM_ADMIN')`,
        [input.assignedTo],
      );
      if (!assignee.rows[0]) {
        await client.query("ROLLBACK");
        response.status(400).json({ error: "The selected technician is unavailable" });
        return;
      }
    }

    const categoryId = input.categoryId ?? parent.category_id;
    const category = await client.query(`SELECT id FROM categories WHERE id = $1 AND is_active = TRUE`, [categoryId]);
    if (!category.rows[0]) {
      await client.query("ROLLBACK");
      response.status(400).json({ error: "The selected category is unavailable" });
      return;
    }

    const childResult = await client.query<{
      id: string; ticket_number: string; title: string; priority: string;
      status: string; due_at: Date | null; created_at: Date;
    }>(
      `INSERT INTO tickets (
         reporter_id, created_by, assigned_to, category_id, department, location_id,
         location_details, title, description, priority, status, source,
         parent_ticket_id, due_at
       )
       VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10, $11, $12::ticket_source,
         $13, $14
       )
       RETURNING id, ticket_number, title, priority, status, due_at, created_at`,
      [
        parent.reporter_id, user.id, input.assignedTo ?? null, categoryId,
        parent.department, parent.location_id, parent.location_details, input.title,
        input.description, input.priority, input.assignedTo ? "ASSIGNED" : "NEW",
        parent.source, parent.id, input.dueAt ?? null,
      ],
    );
    const child = childResult.rows[0];

    await client.query(
      `INSERT INTO audit_events (ticket_id, actor_id, action, new_values)
       VALUES
         ($1, $2, 'SUB_ISSUE_CREATED', $3::jsonb),
         ($4, $2, 'TICKET_CREATED', $5::jsonb)`,
      [
        parent.id, user.id,
        JSON.stringify({ childTicketId: child.id, ticketNumber: child.ticket_number, title: child.title }),
        child.id,
        JSON.stringify({ parentTicketId: parent.id, parentTicketNumber: parent.ticket_number, status: child.status, priority: child.priority }),
      ],
    );

    await client.query(
      `INSERT INTO notification_outbox (ticket_id, recipient_email, event_type, payload)
       VALUES ($1, $2, 'SUB_ISSUE_CREATED', $3::jsonb)`,
      [
        parent.id,
        parent.reporter_email,
        JSON.stringify({
          parentTicketNumber: parent.ticket_number,
          parentTitle: parent.title,
          ticketNumber: child.ticket_number,
          title: child.title,
        }),
      ],
    );

    await client.query("COMMIT");
    response.status(201).json({
      ticket: {
        id: child.id,
        ticketNumber: child.ticket_number,
        title: child.title,
        priority: child.priority,
        status: child.status,
        dueAt: child.due_at,
        createdAt: child.created_at,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Sub-issue creation failed", error);
    response.status(500).json({ error: "Sub-issue creation failed" });
  } finally {
    client.release();
  }
});

portalRouter.post("/tickets/:ticketId/comments", async (request, response) => {
  const parsedId = ticketIdSchema.safeParse(request.params.ticketId);
  const parsedComment = commentSchema.safeParse(request.body);

  if (!parsedId.success || !parsedComment.success) {
    response.status(400).json({
      error: parsedComment.success
        ? "Invalid ticket identifier"
        : parsedComment.error.issues[0]?.message ?? "Invalid comment",
    });
    return;
  }

  const user = currentUser(request);
  const input = parsedComment.data;

  if (user.role === "REPORTER" && input.visibility === "INTERNAL") {
    response.status(403).json({ error: "Reporters cannot create internal notes" });
    return;
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const ticketResult = await client.query<{
      id: string;
      ticket_number: string;
      title: string;
      status: string;
      reporter_id: string;
      reporter_email: string;
      assigned_to: string | null;
      technician_email: string | null;
    }>(
      `SELECT
         tickets.id,
         tickets.ticket_number,
         tickets.title,
         tickets.status,
         tickets.reporter_id,
         reporters.email AS reporter_email,
         tickets.assigned_to,
         technicians.email AS technician_email
       FROM tickets
       JOIN users AS reporters ON reporters.id = tickets.reporter_id
       LEFT JOIN users AS technicians ON technicians.id = tickets.assigned_to
       WHERE tickets.id = $1
       FOR UPDATE OF tickets`,
      [parsedId.data],
    );
    const ticket = ticketResult.rows[0];

    if (!ticket) {
      await client.query("ROLLBACK");
      response.status(404).json({ error: "Ticket not found" });
      return;
    }

    const isAdministrator = user.role === "ADMIN" || user.role === "SYSTEM_ADMIN";
    const mayComment = user.role === "REPORTER"
      ? ticket.reporter_id === user.id
      : isAdministrator || ticket.assigned_to === user.id;

    if (!mayComment) {
      await client.query("ROLLBACK");
      response.status(403).json({
        error: "Claim this ticket before adding technician comments",
      });
      return;
    }

    if (ticket.status === "RESOLVED") {
      await client.query("ROLLBACK");
      response.status(409).json({ error: "Resolved tickets are read-only" });
      return;
    }

    const commentResult = await client.query<{
      id: string;
      body: string;
      visibility: string;
      created_at: Date;
    }>(
      `INSERT INTO comments (ticket_id, author_id, body, visibility)
       VALUES ($1, $2, $3, $4)
       RETURNING id, body, visibility, created_at`,
      [ticket.id, user.id, input.body, input.visibility],
    );
    const comment = commentResult.rows[0];

    await client.query(
      `INSERT INTO audit_events (ticket_id, actor_id, action, new_values)
       VALUES ($1, $2, 'COMMENT_ADDED', $3::jsonb)`,
      [
        ticket.id,
        user.id,
        JSON.stringify({ commentId: comment.id, visibility: comment.visibility }),
      ],
    );

    if (input.visibility === "PUBLIC") {
      const recipientEmail = user.role === "REPORTER"
        ? ticket.technician_email
        : ticket.reporter_email;

      if (recipientEmail) {
        await client.query(
          `INSERT INTO notification_outbox (
             ticket_id,
             recipient_email,
             event_type,
             payload
           )
           VALUES ($1, $2, 'COMMENT_ADDED', $3::jsonb)`,
          [
            ticket.id,
            recipientEmail,
            JSON.stringify({
              ticketNumber: ticket.ticket_number,
              title: ticket.title,
              authorName: user.fullName,
              comment: comment.body,
            }),
          ],
        );
      }
    }

    await client.query("COMMIT");

    response.status(201).json({
      comment: {
        id: comment.id,
        body: comment.body,
        visibility: comment.visibility,
        createdAt: comment.created_at,
        authorId: user.id,
        authorName: user.fullName,
        authorRole: user.role,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Comment creation failed", error);
    response.status(500).json({ error: "Comment creation failed" });
  } finally {
    client.release();
  }
});
