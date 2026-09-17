import { Router } from "express";
import { z } from "zod";

import { pool } from "../db.js";
import {
  requireAuth,
  type AuthenticatedRequest,
} from "../middleware/require-auth.js";

export const ticketsRouter = Router();

ticketsRouter.use(requireAuth);

const createTicketSchema = z.object({
  categoryId: z.number().int().positive(),
  locationId: z.number().int().positive().nullable().optional(),
  locationDetails: z.string().trim().max(200).optional(),
  stationReference: z.string().trim().max(50).optional(),
  title: z.string().trim().min(5).max(160),
  description: z.string().trim().min(10).max(4000),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
});

ticketsRouter.get("/metadata", async (_request, response) => {
  try {
    const [categories, locations] = await Promise.all([
      pool.query(
        `SELECT id, name
         FROM categories
         WHERE is_active = TRUE
         ORDER BY name`,
      ),
      pool.query(
        `SELECT id, name
         FROM locations
         WHERE is_active = TRUE
         ORDER BY name`,
      ),
    ]);

    response.json({
      categories: categories.rows,
      locations: locations.rows,
    });
  } catch (error) {
    console.error("Could not load ticket metadata", error);
    response.status(500).json({ error: "Could not load ticket options" });
  }
});

ticketsRouter.post("/", async (request, response) => {
  const parsed = createTicketSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({
      error: "Invalid ticket information",
      details: parsed.error.issues,
    });
    return;
  }

  const user = (request as AuthenticatedRequest).user;
  const input = parsed.data;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query<{
      id: string;
      ticket_number: string;
      title: string;
      priority: string;
      status: string;
      created_at: Date;
    }>(
      `INSERT INTO tickets (
         reporter_id,
         created_by,
         category_id,
         location_id,
         location_details,
         station_reference,
         title,
         description,
         priority,
         source
       )
       VALUES ($1, $1, $2, $3, $4, $5, $6, $7, $8, 'WEB')
       RETURNING
         id,
         ticket_number,
         title,
         priority,
         status,
         created_at`,
      [
        user.id,
        input.categoryId,
        input.locationId ?? null,
        input.locationDetails || null,
        input.stationReference || null,
        input.title,
        input.description,
        input.priority,
      ],
    );

    const ticket = result.rows[0];

    await client.query(
      `INSERT INTO audit_events (ticket_id, actor_id, action, new_values)
       VALUES ($1, $2, 'TICKET_CREATED', $3::jsonb)`,
      [
        ticket.id,
        user.id,
        JSON.stringify({
          ticketNumber: ticket.ticket_number,
          priority: ticket.priority,
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
       VALUES ($1, $2, 'TICKET_CREATED', $3::jsonb)`,
      [
        ticket.id,
        user.email,
        JSON.stringify({
          ticketNumber: ticket.ticket_number,
          title: ticket.title,
        }),
      ],
    );

    await client.query("COMMIT");

    response.status(201).json({
      ticket: {
        id: ticket.id,
        ticketNumber: ticket.ticket_number,
        title: ticket.title,
        priority: ticket.priority,
        status: ticket.status,
        createdAt: ticket.created_at,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");

    if ((error as { code?: string }).code === "23503") {
      response.status(400).json({
        error: "The selected category or location does not exist",
      });
      return;
    }

    console.error("Ticket creation failed", error);
    response.status(500).json({ error: "Ticket creation failed" });
  } finally {
    client.release();
  }
});

ticketsRouter.get("/mine", async (request, response) => {
  const user = (request as AuthenticatedRequest).user;

  try {
    const result = await pool.query(
      `SELECT
         tickets.id,
         tickets.ticket_number AS "ticketNumber",
         tickets.title,
         tickets.priority,
         tickets.status,
         tickets.location_details AS "locationDetails",
         tickets.station_reference AS "stationReference",
         tickets.created_at AS "createdAt",
         categories.name AS category
       FROM tickets
       JOIN categories ON categories.id = tickets.category_id
       WHERE tickets.reporter_id = $1
         AND tickets.parent_ticket_id IS NULL
       ORDER BY tickets.created_at DESC`,
      [user.id],
    );

    response.json({ tickets: result.rows });
  } catch (error) {
    console.error("Could not load tickets", error);
    response.status(500).json({ error: "Could not load tickets" });
  }
});
