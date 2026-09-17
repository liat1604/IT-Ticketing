import { hash } from "bcryptjs";
import { Router } from "express";
import { z } from "zod";

import { pool } from "../db.js";
import {
  requireAuth,
  requireRole,
  type AuthenticatedRequest,
  type AuthenticatedUser,
} from "../middleware/require-auth.js";

export const adminRouter = Router();

adminRouter.use(
  requireAuth,
  requireRole("ADMIN", "SYSTEM_ADMIN"),
);

const roleSchema = z.enum(["REPORTER", "TECHNICIAN", "ADMIN", "SYSTEM_ADMIN"]);
const passwordSchema = z
  .string()
  .min(12)
  .max(128)
  .regex(/[a-z]/)
  .regex(/[A-Z]/)
  .regex(/[0-9]/);
const nwuEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .refine(
    (email) => email.endsWith("@nwu.ac.za") || email.endsWith("@student.g.nwu.ac.za"),
    "Use a valid NWU email address",
  );

const createUserSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: nwuEmailSchema,
  password: passwordSchema,
  role: roleSchema,
});

const updateUserSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  role: roleSchema.optional(),
  isActive: z.boolean().optional(),
  password: passwordSchema.optional(),
});

function currentUser(request: unknown) {
  return (request as AuthenticatedRequest).user;
}

function canManageRole(actor: AuthenticatedUser, targetRole: string, requestedRole?: string) {
  if (actor.role === "SYSTEM_ADMIN") {
    return true;
  }

  return targetRole !== "SYSTEM_ADMIN" && requestedRole !== "SYSTEM_ADMIN";
}

adminRouter.get("/overview", async (request, response) => {
  const period = String(request.query.period ?? "30");
  const presetDays = period === "365" ? 365 : period === "90" ? 90 : 30;
  const fromInput = String(request.query.from ?? "");
  const toInput = String(request.query.to ?? "");
  const hasCustomRange = Boolean(fromInput || toInput);
  if (hasCustomRange && (!/^\d{4}-\d{2}-\d{2}$/.test(fromInput) || !/^\d{4}-\d{2}-\d{2}$/.test(toInput))) {
    response.status(400).json({ error: "Provide both report dates in YYYY-MM-DD format" });
    return;
  }
  const periodEnd = hasCustomRange
    ? new Date(`${toInput}T00:00:00.000Z`)
    : new Date();
  if (hasCustomRange) periodEnd.setUTCDate(periodEnd.getUTCDate() + 1);
  const periodStart = hasCustomRange
    ? new Date(`${fromInput}T00:00:00.000Z`)
    : new Date(periodEnd.getTime() - presetDays * 86_400_000);
  if (!Number.isFinite(periodStart.getTime()) || !Number.isFinite(periodEnd.getTime()) || periodStart >= periodEnd) {
    response.status(400).json({ error: "The report start date must be before the end date" });
    return;
  }
  const days = Math.max(1, Math.ceil((periodEnd.getTime() - periodStart.getTime()) / 86_400_000));
  const bucket = days <= 45 ? "day" : days <= 180 ? "week" : "month";

  try {
    const [
      summary,
      byCategory,
      byStatus,
      technicianPerformance,
      notifications,
      resolutionByPriority,
      resolutionTimeline,
      backlogAge,
      sourceBreakdown,
      subIssueSummary,
    ] =
      await Promise.all([
        pool.query(
          `SELECT
             COUNT(*) FILTER (WHERE created_at >= $1 AND created_at < $2)::INTEGER
               AS "createdInPeriod",
             COUNT(*) FILTER (
               WHERE status = 'RESOLVED'
                 AND resolved_at >= $1 AND resolved_at < $2
             )::INTEGER AS "resolvedInPeriod",
             COUNT(*) FILTER (WHERE status <> 'RESOLVED')::INTEGER AS "activeTickets",
             COUNT(*) FILTER (WHERE status = 'ESCALATED')::INTEGER AS "escalatedTickets",
             COUNT(*) FILTER (WHERE priority = 'CRITICAL' AND status <> 'RESOLVED')::INTEGER
               AS "criticalTickets",
             COUNT(*) FILTER (WHERE assigned_to IS NULL AND status <> 'RESOLVED')::INTEGER
               AS "unassignedTickets",
             COUNT(*) FILTER (
               WHERE due_at < CURRENT_TIMESTAMP AND status <> 'RESOLVED'
             )::INTEGER AS "overdueTargets",
             COALESCE(
               ROUND(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)))
                 FILTER (
                   WHERE resolved_at IS NOT NULL
                     AND resolved_at >= $1 AND resolved_at < $2
                 ))::INTEGER,
               0
             ) AS "averageResolutionSeconds",
             COALESCE((
               PERCENTILE_CONT(0.5) WITHIN GROUP (
                 ORDER BY EXTRACT(EPOCH FROM (resolved_at - created_at))
               ) FILTER (
                 WHERE resolved_at IS NOT NULL
                   AND resolved_at >= $1 AND resolved_at < $2
               )
             )::INTEGER, 0) AS "medianResolutionSeconds"
           FROM tickets`,
          [periodStart, periodEnd],
        ),
        pool.query(
          `SELECT categories.name, COUNT(tickets.id)::INTEGER AS value
           FROM categories
           LEFT JOIN tickets
             ON tickets.category_id = categories.id
            AND tickets.created_at >= $1 AND tickets.created_at < $2
           GROUP BY categories.id, categories.name
           ORDER BY value DESC, categories.name`,
          [periodStart, periodEnd],
        ),
        pool.query(
          `SELECT status AS name, COUNT(*)::INTEGER AS value
           FROM tickets
           WHERE created_at >= $1 AND created_at < $2
           GROUP BY status
           ORDER BY value DESC`,
          [periodStart, periodEnd],
        ),
        pool.query(
          `SELECT
             users.id,
             users.full_name AS "fullName",
             (SELECT COUNT(*)::INTEGER
              FROM tickets
              WHERE tickets.assigned_to = users.id
                AND tickets.status <> 'RESOLVED') AS "activeTickets",
             (SELECT COUNT(*)::INTEGER
              FROM tickets
              WHERE tickets.assigned_to = users.id
                AND tickets.status = 'RESOLVED'
                AND tickets.resolved_at >= $1 AND tickets.resolved_at < $2)
               AS "resolvedTickets",
             (SELECT COALESCE(SUM(
                EXTRACT(EPOCH FROM (
                  COALESCE(time_entries.stopped_at, CURRENT_TIMESTAMP)
                  - time_entries.started_at
                ))
              ), 0)::INTEGER
              FROM time_entries
              WHERE time_entries.technician_id = users.id
                AND time_entries.started_at >= $1 AND time_entries.started_at < $2)
               AS "workSeconds",
             (SELECT COUNT(DISTINCT time_entries.ticket_id)::INTEGER
              FROM time_entries
              WHERE time_entries.technician_id = users.id
                AND time_entries.started_at >= $1 AND time_entries.started_at < $2)
               AS "handledTickets",
             (SELECT COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (
                       tickets.resolved_at - tickets.created_at
                     ))))::INTEGER, 0)
              FROM tickets
              WHERE tickets.assigned_to = users.id
                AND tickets.resolved_at >= $1 AND tickets.resolved_at < $2)
               AS "averageResolutionSeconds",
             (SELECT COUNT(*)::INTEGER
              FROM tickets
              WHERE tickets.created_by = users.id
                AND tickets.source = 'WALK_IN'
                AND tickets.created_at >= $1 AND tickets.created_at < $2)
               AS "manualTickets"
           FROM users
           WHERE users.role = 'TECHNICIAN'
             AND users.is_active = TRUE
           ORDER BY "resolvedTickets" DESC, users.full_name`,
          [periodStart, periodEnd],
        ),
        pool.query(
          `SELECT
             COUNT(*) FILTER (WHERE processed_at IS NULL)::INTEGER AS pending,
             COUNT(*) FILTER (WHERE processed_at IS NOT NULL)::INTEGER AS sent,
             COUNT(*) FILTER (WHERE processed_at IS NULL AND attempts > 0)::INTEGER AS failed
           FROM notification_outbox`,
        ),
        pool.query(
          `SELECT
             priority AS name,
             COUNT(*)::INTEGER AS "resolvedTickets",
             COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))))::INTEGER, 0)
               AS "averageResolutionSeconds",
             COALESCE((PERCENTILE_CONT(0.5) WITHIN GROUP (
               ORDER BY EXTRACT(EPOCH FROM (resolved_at - created_at))
             ))::INTEGER, 0) AS "medianResolutionSeconds",
             COUNT(*) FILTER (
               WHERE EXTRACT(EPOCH FROM (resolved_at - created_at)) <=
                 CASE priority
                   WHEN 'CRITICAL' THEN 14400
                   WHEN 'HIGH' THEN 86400
                   WHEN 'MEDIUM' THEN 259200
                   WHEN 'LOW' THEN 432000
                 END
             )::INTEGER AS "withinTarget",
             CASE priority
               WHEN 'CRITICAL' THEN 14400
               WHEN 'HIGH' THEN 86400
               WHEN 'MEDIUM' THEN 259200
               WHEN 'LOW' THEN 432000
             END AS "targetSeconds"
           FROM tickets
           WHERE resolved_at >= $1 AND resolved_at < $2
           GROUP BY priority
           ORDER BY CASE priority
             WHEN 'CRITICAL' THEN 1
             WHEN 'HIGH' THEN 2
             WHEN 'MEDIUM' THEN 3
             WHEN 'LOW' THEN 4
           END`,
          [periodStart, periodEnd],
        ),
        pool.query(
          `WITH activity AS (
             SELECT date_trunc($3::text, created_at) AS period, 1 AS created, 0 AS resolved
             FROM tickets
             WHERE created_at >= $1 AND created_at < $2
             UNION ALL
             SELECT date_trunc($3::text, resolved_at) AS period, 0 AS created, 1 AS resolved
             FROM tickets
             WHERE resolved_at >= $1 AND resolved_at < $2
           )
           SELECT period AS label,
                  SUM(created)::INTEGER AS created,
                  SUM(resolved)::INTEGER AS resolved
           FROM activity
           GROUP BY period
           ORDER BY period`,
          [periodStart, periodEnd, bucket],
        ),
        pool.query(
          `SELECT name, value
           FROM (
             SELECT
               CASE
                 WHEN CURRENT_TIMESTAMP - created_at < INTERVAL '2 days' THEN '0–2 days'
                 WHEN CURRENT_TIMESTAMP - created_at < INTERVAL '7 days' THEN '3–7 days'
                 WHEN CURRENT_TIMESTAMP - created_at < INTERVAL '14 days' THEN '8–14 days'
                 ELSE '15+ days'
               END AS name,
               CASE
                 WHEN CURRENT_TIMESTAMP - created_at < INTERVAL '2 days' THEN 1
                 WHEN CURRENT_TIMESTAMP - created_at < INTERVAL '7 days' THEN 2
                 WHEN CURRENT_TIMESTAMP - created_at < INTERVAL '14 days' THEN 3
                 ELSE 4
               END AS sort_order,
               COUNT(*)::INTEGER AS value
             FROM tickets
             WHERE status <> 'RESOLVED'
             GROUP BY name, sort_order
           ) AS ageing
           ORDER BY sort_order`,
        ),
        pool.query(
          `SELECT source AS name, COUNT(*)::INTEGER AS value
           FROM tickets
           WHERE created_at >= $1 AND created_at < $2
           GROUP BY source
           ORDER BY value DESC`,
          [periodStart, periodEnd],
        ),
        pool.query(
          `SELECT
             COUNT(DISTINCT parent_ticket_id) FILTER (
               WHERE parent_ticket_id IS NOT NULL
             )::INTEGER AS "parentsWithSubIssues",
             COUNT(*) FILTER (WHERE parent_ticket_id IS NOT NULL)::INTEGER AS "totalSubIssues",
             COUNT(*) FILTER (
               WHERE parent_ticket_id IS NOT NULL AND status = 'RESOLVED'
             )::INTEGER AS "resolvedSubIssues",
             COUNT(*) FILTER (
               WHERE due_at < CURRENT_TIMESTAMP AND status <> 'RESOLVED'
             )::INTEGER AS "overdueWorkItems"
           FROM tickets`,
        ),
      ]);

    const metrics = summary.rows[0];
    const created = Number(metrics.createdInPeriod || 0);
    const resolved = Number(metrics.resolvedInPeriod || 0);

    response.json({
      periodDays: days,
      periodStart: periodStart.toISOString(),
      periodEnd: new Date(periodEnd.getTime() - 1).toISOString(),
      metrics: {
        ...metrics,
        resolutionRate: created === 0 ? 0 : Math.round((resolved / created) * 100),
      },
      byCategory: byCategory.rows,
      byStatus: byStatus.rows,
      technicianPerformance: technicianPerformance.rows,
      notifications: notifications.rows[0],
      resolutionByPriority: resolutionByPriority.rows,
      resolutionTimeline: resolutionTimeline.rows,
      backlogAge: backlogAge.rows,
      sourceBreakdown: sourceBreakdown.rows,
      subIssueSummary: subIssueSummary.rows[0],
    });
  } catch (error) {
    console.error("Could not load administrator overview", error);
    response.status(500).json({ error: "Could not load administrator overview" });
  }
});

adminRouter.get("/tickets", async (request, response) => {
  const search = String(request.query.search ?? "").trim();
  const status = String(request.query.status ?? "ALL");
  const priority = String(request.query.priority ?? "ALL");
  const parameters: unknown[] = [];
  const conditions: string[] = [];

  if (search) {
    parameters.push(search);
    conditions.push(`(
      tickets.ticket_number ILIKE '%' || $${parameters.length} || '%'
      OR tickets.title ILIKE '%' || $${parameters.length} || '%'
      OR reporters.full_name ILIKE '%' || $${parameters.length} || '%'
      OR reporters.email ILIKE '%' || $${parameters.length} || '%'
    )`);
  }

  if (["NEW", "ASSIGNED", "IN_PROGRESS", "AWAITING_FEEDBACK", "ESCALATED", "RESOLVED"].includes(status)) {
    parameters.push(status);
    conditions.push(`tickets.status = $${parameters.length}::ticket_status`);
  }

  if (["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(priority)) {
    parameters.push(priority);
    conditions.push(`tickets.priority = $${parameters.length}::ticket_priority`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  try {
    const result = await pool.query(
      `SELECT
         tickets.id,
         tickets.ticket_number AS "ticketNumber",
         tickets.title,
         tickets.priority,
         tickets.status,
         tickets.source,
         tickets.due_at AS "dueAt",
         tickets.created_at AS "createdAt",
         tickets.resolved_at AS "resolvedAt",
         categories.name AS category,
         reporters.full_name AS "reporterName",
         reporters.email AS "reporterEmail",
         technicians.full_name AS "technicianName",
         parent.ticket_number AS "parentTicketNumber"
       FROM tickets
       JOIN categories ON categories.id = tickets.category_id
       JOIN users AS reporters ON reporters.id = tickets.reporter_id
       LEFT JOIN users AS technicians ON technicians.id = tickets.assigned_to
       LEFT JOIN tickets AS parent ON parent.id = tickets.parent_ticket_id
       ${whereClause}
       ORDER BY
         CASE tickets.priority
           WHEN 'CRITICAL' THEN 1
           WHEN 'HIGH' THEN 2
           WHEN 'MEDIUM' THEN 3
           WHEN 'LOW' THEN 4
         END,
         tickets.created_at DESC
       LIMIT 250`,
      parameters,
    );

    response.json({ tickets: result.rows });
  } catch (error) {
    console.error("Could not load administrator tickets", error);
    response.status(500).json({ error: "Could not load administrator tickets" });
  }
});

adminRouter.get("/users", async (request, response) => {
  const search = String(request.query.search ?? "").trim();

  try {
    const result = await pool.query(
      `SELECT
         users.id,
         users.full_name AS "fullName",
         users.email,
         users.role,
         users.is_active AS "isActive",
         users.created_at AS "createdAt",
         COUNT(DISTINCT reported.id)::INTEGER AS "reportedTickets",
         COUNT(DISTINCT assigned.id)::INTEGER AS "assignedTickets"
       FROM users
       LEFT JOIN tickets AS reported ON reported.reporter_id = users.id
       LEFT JOIN tickets AS assigned ON assigned.assigned_to = users.id
       WHERE $1 = ''
          OR users.full_name ILIKE '%' || $1 || '%'
          OR users.email ILIKE '%' || $1 || '%'
       GROUP BY users.id
       ORDER BY users.full_name`,
      [search],
    );

    response.json({ users: result.rows });
  } catch (error) {
    console.error("Could not load users", error);
    response.status(500).json({ error: "Could not load users" });
  }
});

adminRouter.post("/users", async (request, response) => {
  const actor = currentUser(request);
  const parsed = createUserSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({
      error: parsed.error.issues[0]?.message ?? "Invalid user information",
    });
    return;
  }

  if (!canManageRole(actor, "REPORTER", parsed.data.role)) {
    response.status(403).json({
      error: "Only a system administrator can create system administrators",
    });
    return;
  }

  const passwordHash = await hash(parsed.data.password, 12);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query<{
      id: string;
      full_name: string;
      email: string;
      role: string;
      is_active: boolean;
      created_at: Date;
    }>(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, full_name, email, role, is_active, created_at`,
      [parsed.data.fullName, parsed.data.email, passwordHash, parsed.data.role],
    );
    const user = result.rows[0];

    await client.query(
      `INSERT INTO audit_events (actor_id, action, new_values)
       VALUES ($1, 'USER_CREATED_BY_ADMIN', $2::jsonb)`,
      [
        actor.id,
        JSON.stringify({
          userId: user.id,
          email: user.email,
          role: user.role,
        }),
      ],
    );

    await client.query("COMMIT");

    response.status(201).json({
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        role: user.role,
        isActive: user.is_active,
        createdAt: user.created_at,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");

    if ((error as { code?: string }).code === "23505") {
      response.status(409).json({ error: "A user with this email already exists" });
      return;
    }

    console.error("Administrator user creation failed", error);
    response.status(500).json({ error: "User creation failed" });
  } finally {
    client.release();
  }
});

adminRouter.patch("/users/:userId", async (request, response) => {
  const actor = currentUser(request);
  const parsedId = z.string().uuid().safeParse(request.params.userId);
  const parsed = updateUserSchema.safeParse(request.body);

  if (!parsedId.success || !parsed.success || Object.keys(parsed.data).length === 0) {
    response.status(400).json({ error: "Invalid user update" });
    return;
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const existingResult = await client.query<{
      id: string;
      full_name: string;
      email: string;
      role: string;
      is_active: boolean;
    }>(
      `SELECT id, full_name, email, role, is_active
       FROM users
       WHERE id = $1
       FOR UPDATE`,
      [parsedId.data],
    );
    const existing = existingResult.rows[0];

    if (!existing) {
      await client.query("ROLLBACK");
      response.status(404).json({ error: "User not found" });
      return;
    }

    if (!canManageRole(actor, existing.role, parsed.data.role)) {
      await client.query("ROLLBACK");
      response.status(403).json({
        error: "Only a system administrator can manage system administrators",
      });
      return;
    }

    if (existing.id === actor.id && parsed.data.isActive === false) {
      await client.query("ROLLBACK");
      response.status(409).json({ error: "You cannot deactivate your own account" });
      return;
    }

    const passwordHash = parsed.data.password
      ? await hash(parsed.data.password, 12)
      : null;
    const updatedResult = await client.query<{
      id: string;
      full_name: string;
      email: string;
      role: string;
      is_active: boolean;
      created_at: Date;
    }>(
      `UPDATE users
       SET
         full_name = COALESCE($2, full_name),
         role = COALESCE($3::user_role, role),
         is_active = COALESCE($4, is_active),
         password_hash = COALESCE($5, password_hash),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, full_name, email, role, is_active, created_at`,
      [
        existing.id,
        parsed.data.fullName ?? null,
        parsed.data.role ?? null,
        parsed.data.isActive ?? null,
        passwordHash,
      ],
    );
    const updated = updatedResult.rows[0];

    if (parsed.data.isActive === false || parsed.data.password) {
      await client.query(
        `UPDATE sessions
         SET revoked_at = CURRENT_TIMESTAMP
         WHERE user_id = $1
           AND revoked_at IS NULL`,
        [existing.id],
      );
    }

    await client.query(
      `INSERT INTO audit_events (actor_id, action, previous_values, new_values)
       VALUES ($1, 'USER_UPDATED_BY_ADMIN', $2::jsonb, $3::jsonb)`,
      [
        actor.id,
        JSON.stringify({
          userId: existing.id,
          fullName: existing.full_name,
          role: existing.role,
          isActive: existing.is_active,
        }),
        JSON.stringify({
          userId: updated.id,
          fullName: updated.full_name,
          role: updated.role,
          isActive: updated.is_active,
          passwordReset: Boolean(parsed.data.password),
        }),
      ],
    );

    await client.query("COMMIT");

    response.json({
      user: {
        id: updated.id,
        fullName: updated.full_name,
        email: updated.email,
        role: updated.role,
        isActive: updated.is_active,
        createdAt: updated.created_at,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Administrator user update failed", error);
    response.status(500).json({ error: "User update failed" });
  } finally {
    client.release();
  }
});

adminRouter.get("/audit", async (request, response) => {
  const limit = Math.min(Math.max(Number(request.query.limit) || 100, 1), 500);

  try {
    const result = await pool.query(
      `SELECT
         audit_events.id,
         audit_events.action,
         audit_events.previous_values AS "previousValues",
         audit_events.new_values AS "newValues",
         audit_events.created_at AS "createdAt",
         users.full_name AS "actorName",
         tickets.ticket_number AS "ticketNumber"
       FROM audit_events
       LEFT JOIN users ON users.id = audit_events.actor_id
       LEFT JOIN tickets ON tickets.id = audit_events.ticket_id
       ORDER BY audit_events.created_at DESC
       LIMIT $1`,
      [limit],
    );

    response.json({ events: result.rows });
  } catch (error) {
    console.error("Could not load audit events", error);
    response.status(500).json({ error: "Could not load audit events" });
  }
});

adminRouter.get("/reports/tickets.csv", async (request, response) => {
  const fromInput = String(request.query.from ?? "");
  const toInput = String(request.query.to ?? "");
  const hasCustomRange = Boolean(fromInput || toInput);
  if (hasCustomRange && (!/^\d{4}-\d{2}-\d{2}$/.test(fromInput) || !/^\d{4}-\d{2}-\d{2}$/.test(toInput))) {
    response.status(400).json({ error: "Provide both report dates in YYYY-MM-DD format" });
    return;
  }
  const rangeStart = hasCustomRange ? new Date(`${fromInput}T00:00:00.000Z`) : null;
  const rangeEnd = hasCustomRange ? new Date(`${toInput}T00:00:00.000Z`) : null;
  if (rangeEnd) rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1);
  if (rangeStart && rangeEnd && rangeStart >= rangeEnd) {
    response.status(400).json({ error: "The report start date must be before the end date" });
    return;
  }
  try {
    const result = await pool.query<{
      ticket_number: string;
      title: string;
      category: string;
      priority: string;
      status: string;
      reporter: string;
      technician: string | null;
      parent_ticket: string | null;
      due_at: Date | null;
      created_at: Date;
      resolved_at: Date | null;
      resolution_seconds: number | null;
    }>(
      `SELECT
         tickets.ticket_number,
         tickets.title,
         categories.name AS category,
         tickets.priority,
         tickets.status,
         reporters.full_name AS reporter,
         technicians.full_name AS technician,
         parent.ticket_number AS parent_ticket,
         tickets.due_at,
         tickets.created_at,
         tickets.resolved_at,
         EXTRACT(EPOCH FROM (tickets.resolved_at - tickets.created_at))::INTEGER
           AS resolution_seconds
       FROM tickets
       JOIN categories ON categories.id = tickets.category_id
       JOIN users AS reporters ON reporters.id = tickets.reporter_id
       LEFT JOIN users AS technicians ON technicians.id = tickets.assigned_to
       LEFT JOIN tickets AS parent ON parent.id = tickets.parent_ticket_id
       ${hasCustomRange ? "WHERE tickets.created_at >= $1 AND tickets.created_at < $2" : ""}
       ORDER BY tickets.created_at DESC`,
      hasCustomRange ? [rangeStart, rangeEnd] : [],
    );

    const header = [
      "Ticket Number",
      "Title",
      "Category",
      "Priority",
      "Status",
      "Reporter",
      "Technician",
      "Parent Ticket",
      "Target Date",
      "Created At",
      "Resolved At",
      "Resolution Seconds",
    ];
    const rows = result.rows.map((row) => [
      row.ticket_number,
      row.title,
      row.category,
      row.priority,
      row.status,
      row.reporter,
      row.technician ?? "",
      row.parent_ticket ?? "",
      row.due_at?.toISOString() ?? "",
      row.created_at.toISOString(),
      row.resolved_at?.toISOString() ?? "",
      row.resolution_seconds ?? "",
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n");

    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="csis-ticket-report-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    response.send(`\uFEFF${csv}`);
  } catch (error) {
    console.error("Could not export ticket report", error);
    response.status(500).json({ error: "Could not export ticket report" });
  }
});

adminRouter.get("/reports/technicians.csv", async (request, response) => {
  const fromInput = String(request.query.from ?? "");
  const toInput = String(request.query.to ?? "");
  const hasCustomRange = Boolean(fromInput || toInput);
  if (hasCustomRange && (!/^\d{4}-\d{2}-\d{2}$/.test(fromInput) || !/^\d{4}-\d{2}-\d{2}$/.test(toInput))) {
    response.status(400).json({ error: "Provide both report dates in YYYY-MM-DD format" });
    return;
  }
  const end = hasCustomRange ? new Date(`${toInput}T00:00:00.000Z`) : new Date();
  if (hasCustomRange) end.setUTCDate(end.getUTCDate() + 1);
  const start = hasCustomRange ? new Date(`${fromInput}T00:00:00.000Z`) : new Date(end.getTime() - 30 * 86_400_000);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) {
    response.status(400).json({ error: "The report start date must be before the end date" });
    return;
  }

  try {
    const result = await pool.query<{
      full_name: string;
      active_tickets: number;
      handled_tickets: number;
      resolved_tickets: number;
      manual_tickets: number;
      work_seconds: number;
      average_resolution_seconds: number;
    }>(
      `SELECT
         users.full_name,
         (SELECT COUNT(*)::INTEGER FROM tickets
          WHERE tickets.assigned_to = users.id AND tickets.status <> 'RESOLVED') AS active_tickets,
         (SELECT COUNT(DISTINCT time_entries.ticket_id)::INTEGER FROM time_entries
          WHERE time_entries.technician_id = users.id
            AND time_entries.started_at >= $1 AND time_entries.started_at < $2) AS handled_tickets,
         (SELECT COUNT(*)::INTEGER FROM tickets
          WHERE tickets.assigned_to = users.id
            AND tickets.resolved_at >= $1 AND tickets.resolved_at < $2) AS resolved_tickets,
         (SELECT COUNT(*)::INTEGER FROM tickets
          WHERE tickets.created_by = users.id AND tickets.source = 'WALK_IN'
            AND tickets.created_at >= $1 AND tickets.created_at < $2) AS manual_tickets,
         (SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (
             COALESCE(time_entries.stopped_at, CURRENT_TIMESTAMP) - time_entries.started_at
           ))), 0)::INTEGER FROM time_entries
          WHERE time_entries.technician_id = users.id
            AND time_entries.started_at >= $1 AND time_entries.started_at < $2) AS work_seconds,
         (SELECT COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (
             tickets.resolved_at - tickets.created_at
           ))))::INTEGER, 0) FROM tickets
          WHERE tickets.assigned_to = users.id
            AND tickets.resolved_at >= $1 AND tickets.resolved_at < $2) AS average_resolution_seconds
       FROM users
       WHERE users.role = 'TECHNICIAN' AND users.is_active = TRUE
       ORDER BY resolved_tickets DESC, users.full_name`,
      [start, end],
    );

    const header = [
      "Technician", "Active Tickets", "Handled Tickets", "Resolved Tickets",
      "Walk-in Tickets", "Recorded Work Seconds", "Average Resolution Seconds",
      "Period Start", "Period End",
    ];
    const rows = result.rows.map((row) => [
      row.full_name,
      row.active_tickets,
      row.handled_tickets,
      row.resolved_tickets,
      row.manual_tickets,
      row.work_seconds,
      row.average_resolution_seconds,
      start.toISOString(),
      new Date(end.getTime() - 1).toISOString(),
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="csis-technician-report-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    response.send(`\uFEFF${csv}`);
  } catch (error) {
    console.error("Could not export technician report", error);
    response.status(500).json({ error: "Could not export technician report" });
  }
});

adminRouter.get("/backup", requireRole("SYSTEM_ADMIN"), async (request, response) => {
  const actor = currentUser(request);

  try {
    const [users, categories, locations, tickets, comments, timeEntries, escalations, auditEvents, scheduleEvents] =
      await Promise.all([
        pool.query(`SELECT id, email, full_name, role, is_active, created_at, updated_at FROM users ORDER BY created_at`),
        pool.query(`SELECT * FROM categories ORDER BY id`),
        pool.query(`SELECT * FROM locations ORDER BY id`),
        pool.query(`SELECT * FROM tickets ORDER BY created_at`),
        pool.query(`SELECT * FROM comments ORDER BY created_at`),
        pool.query(`SELECT * FROM time_entries ORDER BY started_at`),
        pool.query(`SELECT * FROM escalations ORDER BY escalated_at`),
        pool.query(`SELECT * FROM audit_events ORDER BY created_at`),
        pool.query(`SELECT * FROM schedule_events ORDER BY starts_at`),
      ]);

    await pool.query(
      `INSERT INTO audit_events (actor_id, action, new_values)
       VALUES ($1, 'DATABASE_BACKUP_EXPORTED', $2::jsonb)`,
      [actor.id, JSON.stringify({ exportedAt: new Date().toISOString() })],
    );

    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="csis-ticketing-backup-${new Date().toISOString().slice(0, 10)}.json"`,
    );
    response.json({
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      data: {
        users: users.rows,
        categories: categories.rows,
        locations: locations.rows,
        tickets: tickets.rows,
        comments: comments.rows,
        timeEntries: timeEntries.rows,
        escalations: escalations.rows,
        auditEvents: auditEvents.rows,
        scheduleEvents: scheduleEvents.rows,
      },
    });
  } catch (error) {
    console.error("Could not export database backup", error);
    response.status(500).json({ error: "Could not export database backup" });
  }
});

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}
