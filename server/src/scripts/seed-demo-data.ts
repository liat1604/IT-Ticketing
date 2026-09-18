import "dotenv/config";
import { hash } from "bcryptjs";
import type { PoolClient } from "pg";

import { pool } from "../db.js";

type UserRole = "REPORTER" | "TECHNICIAN" | "ADMIN" | "SYSTEM_ADMIN";
type TicketStatus = "NEW" | "IN_PROGRESS" | "ESCALATED" | "RESOLVED";
type SeedUser = {
  fullName: string;
  email: string;
  password: string;
  role: UserRole;
};

type SeedTicket = {
  key: string;
  title: string;
  description: string;
  category: string;
  location: string;
  locationDetails: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: TicketStatus;
  technicianEmail?: string;
  ageHours: number;
  resolutionSummary?: string;
  escalationReason?: string;
  externalReference?: string;
};

const users: SeedUser[] = [
  {
    fullName: "Selouna Visser",
    email: "selouna.visser@nwu.ac.za",
    password: "SystemAdmin2026!",
    role: "SYSTEM_ADMIN",
  },
  {
    fullName: "Development Administrator",
    email: "dev.admin@nwu.ac.za",
    password: "Development123!",
    role: "ADMIN",
  },
  {
    fullName: "Sebastian Klopper",
    email: "sebastian.klopper@nwu.ac.za",
    password: "TechDemo2026!",
    role: "TECHNICIAN",
  },
  {
    fullName: "Amina Dlamini",
    email: "amina.dlamini@student.g.nwu.ac.za",
    password: "StudentDemo2026!",
    role: "REPORTER",
  },
];

if (process.env.NODE_ENV === "production") {
  throw new Error("Demo accounts cannot be seeded in production");
}

const tickets: SeedTicket[] = [
  {
    key: "DEMO-PROJECTOR-G14",
    title: "Projector not displaying in Lab G14",
    description: "The lectern computer detects the projector, but the screen remains blank after restarting both devices.",
    category: "Hardware",
    location: "Lab G14",
    locationDetails: "Front teaching station",
    priority: "MEDIUM",
    status: "NEW",
    ageHours: 2,
  },
  {
    key: "DEMO-PORTAL-ACCESS",
    title: "Student portal login blocked",
    description: "The student receives an access denied message after completing multi-factor authentication.",
    category: "Access",
    location: "Online",
    locationDetails: "Student portal",
    priority: "HIGH",
    status: "NEW",
    ageHours: 5,
  },
  {
    key: "DEMO-WIFI-G30",
    title: "Intermittent Wi-Fi in Lab G30",
    description: "Connections drop every few minutes for multiple workstations during practical sessions.",
    category: "Network",
    location: "Lab G30",
    locationDetails: "Rows B to D",
    priority: "HIGH",
    status: "IN_PROGRESS",
    technicianEmail: "sebastian.klopper@nwu.ac.za",
    ageHours: 18,
  },
  {
    key: "DEMO-MATLAB-LICENCE",
    title: "MATLAB licence activation failure",
    description: "MATLAB reports that the campus licence server cannot be reached on several laboratory computers.",
    category: "Software",
    location: "Lab G14",
    locationDetails: "Stations 20 to 26",
    priority: "MEDIUM",
    status: "IN_PROGRESS",
    technicianEmail: "sebastian.klopper@nwu.ac.za",
    ageHours: 26,
  },
  {
    key: "DEMO-CORE-SWITCH",
    title: "Core switch packet loss in Building G",
    description: "Monitoring shows sustained packet loss affecting multiple teaching laboratories and staff offices.",
    category: "Network",
    location: "Building G",
    locationDetails: "Distribution cabinet G-02",
    priority: "CRITICAL",
    status: "ESCALATED",
    technicianEmail: "sebastian.klopper@nwu.ac.za",
    ageHours: 30,
    escalationReason: "The fault affects the building distribution layer and requires Central IT network engineering access.",
    externalReference: "NWU-CT-2026-104",
  },
  {
    key: "DEMO-LAB-LOCKOUTS",
    title: "Repeated account lockouts across lab PCs",
    description: "Multiple valid student accounts are being locked immediately after attempting to sign in to domain workstations.",
    category: "Access",
    location: "Lab G30",
    locationDetails: "All student stations",
    priority: "HIGH",
    status: "ESCALATED",
    technicianEmail: "sebastian.klopper@nwu.ac.za",
    ageHours: 48,
    escalationReason: "The issue appears to originate from central identity policy and cannot be corrected within CSIS permissions.",
    externalReference: "NWU-CT-2026-105",
  },
  {
    key: "DEMO-KEYBOARD-12",
    title: "Faulty keyboard at Station 12",
    description: "Several keys were unresponsive and prevented the workstation from being used for practical work.",
    category: "Hardware",
    location: "Lab G14",
    locationDetails: "Station 12",
    priority: "LOW",
    status: "RESOLVED",
    technicianEmail: "sebastian.klopper@nwu.ac.za",
    ageHours: 96,
    resolutionSummary: "Replaced the keyboard, tested all keys and returned the station to service.",
  },
  {
    key: "DEMO-UPS-OVERHEAT",
    title: "UPS overheating warning in server room",
    description: "The monitoring panel reported elevated temperature and an audible warning from the secondary UPS.",
    category: "Physical Hazard",
    location: "Server Room",
    locationDetails: "Secondary UPS rack",
    priority: "CRITICAL",
    status: "RESOLVED",
    technicianEmail: "sebastian.klopper@nwu.ac.za",
    ageHours: 144,
    resolutionSummary: "Isolated the affected UPS, cleared the blocked ventilation path and confirmed stable operating temperature.",
  },
];

const requiredTicketStatuses: TicketStatus[] = [
  "NEW",
  "IN_PROGRESS",
  "ESCALATED",
  "RESOLVED",
];

function assertDemoTicketCoverage() {
  const seededStatuses = new Set(tickets.map((ticket) => ticket.status));
  const missingStatuses = requiredTicketStatuses.filter(
    (status) => !seededStatuses.has(status),
  );

  if (missingStatuses.length > 0) {
    throw new Error(`Demo tickets are missing statuses: ${missingStatuses.join(", ")}`);
  }

  if (!tickets.some((ticket) => ticket.ageHours >= 72)) {
    throw new Error("Demo data must include at least one ticket older than 72 hours");
  }
}

async function upsertUser(
  client: PoolClient,
  user: SeedUser,
) {
  const passwordHash = await hash(user.password, 12);
  const result = await client.query<{ id: string }>(
    `INSERT INTO users (full_name, email, password_hash, role, is_active)
     VALUES ($1, $2, $3, $4, TRUE)
     ON CONFLICT (LOWER(email)) DO UPDATE
       SET full_name = EXCLUDED.full_name,
           password_hash = EXCLUDED.password_hash,
           role = EXCLUDED.role,
           is_active = TRUE,
           updated_at = CURRENT_TIMESTAMP
     RETURNING id`,
    [user.fullName, user.email, passwordHash, user.role],
  );
  return result.rows[0].id;
}

async function main() {
  assertDemoTicketCoverage();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const oldTechnician = await client.query<{ id: string }>(
      `SELECT id FROM users WHERE LOWER(email) = 'technician.test@nwu.ac.za'`,
    );
    const existingLerato = await client.query<{ id: string }>(
      `SELECT id FROM users WHERE LOWER(email) = 'lerato.mokoena@nwu.ac.za'`,
    );

    if (oldTechnician.rows[0] && !existingLerato.rows[0]) {
      await client.query(
        `UPDATE users
         SET full_name = 'Lerato Mokoena',
             email = 'lerato.mokoena@nwu.ac.za',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [oldTechnician.rows[0].id],
      );
    }

    const userIds = new Map<string, string>();
    for (const user of users) {
      userIds.set(user.email, await upsertUser(client, user));
    }

    const reporterEmail = "amina.dlamini@student.g.nwu.ac.za";
    const reporterId = userIds.get(reporterEmail);
    if (!reporterId) throw new Error("The seeded student reporter account is required");
    const reporter = { id: reporterId, email: reporterEmail };

    for (const ticket of tickets) {
      const technicianId = ticket.technicianEmail
        ? userIds.get(ticket.technicianEmail) ?? null
        : null;
      const resolvedAt = ticket.status === "RESOLVED"
        ? new Date(Date.now() - Math.max(1, ticket.ageHours - 8) * 60 * 60 * 1000)
        : null;

      const ticketResult = await client.query<{ id: string; ticket_number: string }>(
        `WITH updated AS (
           UPDATE tickets
           SET reporter_id = $1,
               created_by = $1,
               assigned_to = $2,
               category_id = categories.id,
               location_id = locations.id,
               location_details = $3,
               title = $5,
               description = $6,
               priority = $7::ticket_priority,
               status = $8::ticket_status,
               source = 'WEB',
               resolution_summary = $9,
               resolved_at = $10,
               created_at = CURRENT_TIMESTAMP - ($11 * INTERVAL '1 hour'),
               updated_at = CURRENT_TIMESTAMP
           FROM categories, locations
           WHERE tickets.station_reference = $4
             AND categories.name = $12
             AND locations.name = $13
           RETURNING tickets.id, tickets.ticket_number
         ),
         inserted AS (
           INSERT INTO tickets (
             reporter_id, created_by, assigned_to, category_id, location_id,
             location_details, station_reference, title, description,
             priority, status, source, resolution_summary, resolved_at,
             created_at, updated_at
           )
           SELECT
             $1, $1, $2, categories.id, locations.id,
             $3, $4, $5, $6,
             $7::ticket_priority, $8::ticket_status, 'WEB', $9, $10,
             CURRENT_TIMESTAMP - ($11 * INTERVAL '1 hour'), CURRENT_TIMESTAMP
           FROM categories, locations
           WHERE categories.name = $12
             AND locations.name = $13
             AND NOT EXISTS (SELECT 1 FROM updated)
           RETURNING id, ticket_number
         )
         SELECT id, ticket_number FROM updated
         UNION ALL
         SELECT id, ticket_number FROM inserted
         LIMIT 1`,
        [
          reporter.id,
          technicianId,
          ticket.locationDetails,
          ticket.key,
          ticket.title,
          ticket.description,
          ticket.priority,
          ticket.status,
          ticket.resolutionSummary ?? null,
          resolvedAt,
          ticket.ageHours,
          ticket.category,
          ticket.location,
        ],
      );
      const seeded = ticketResult.rows[0];
      if (!seeded) throw new Error(`Could not seed ${ticket.key}`);

      await client.query(
        `INSERT INTO audit_events (ticket_id, actor_id, action, new_values, created_at)
         SELECT $1, $2, 'TICKET_CREATED', $3::jsonb,
                CURRENT_TIMESTAMP - ($4 * INTERVAL '1 hour')
         WHERE NOT EXISTS (
           SELECT 1 FROM audit_events
           WHERE ticket_id = $1 AND action = 'TICKET_CREATED'
         )`,
        [seeded.id, reporter.id, JSON.stringify({ status: ticket.status, priority: ticket.priority, seed: true }), ticket.ageHours],
      );

      if (technicianId) {
        await client.query(
          `INSERT INTO time_entries (ticket_id, technician_id, started_at, stopped_at)
           SELECT $1, $2,
                  CURRENT_TIMESTAMP - (($3 - 2) * INTERVAL '1 hour'),
                  CURRENT_TIMESTAMP - (($3 - 3) * INTERVAL '1 hour')
           WHERE NOT EXISTS (SELECT 1 FROM time_entries WHERE ticket_id = $1)`,
          [seeded.id, technicianId, ticket.ageHours],
        );

        await client.query(
          `INSERT INTO comments (ticket_id, author_id, body, visibility)
           SELECT $1, $2, $3, 'PUBLIC'
           WHERE NOT EXISTS (
             SELECT 1 FROM comments WHERE ticket_id = $1 AND body = $3
           )`,
          [
            seeded.id,
            technicianId,
            ticket.status === "RESOLVED"
              ? "The work has been completed and the resolution is recorded on this ticket."
              : "The support team is investigating this request and will post the next update here.",
          ],
        );
      }

      if (ticket.status === "ESCALATED" && technicianId) {
        await client.query(
          `INSERT INTO escalations (ticket_id, escalated_by, reason, external_reference, escalated_at)
           SELECT $1, $2, $3, $4, CURRENT_TIMESTAMP - INTERVAL '4 hours'
           WHERE NOT EXISTS (SELECT 1 FROM escalations WHERE ticket_id = $1)`,
          [seeded.id, technicianId, ticket.escalationReason, ticket.externalReference],
        );
      }

      await client.query(
        `INSERT INTO notification_outbox (ticket_id, recipient_email, event_type, payload)
         SELECT $1, $2, $3, $4::jsonb
         WHERE NOT EXISTS (
           SELECT 1 FROM notification_outbox
           WHERE ticket_id = $1 AND event_type = $3
         )`,
        [seeded.id, reporter.email, `DEMO_${ticket.status}`, JSON.stringify({ ticketNumber: seeded.ticket_number, title: ticket.title })],
      );
    }

    await client.query(
      `INSERT INTO audit_events (actor_id, action, new_values)
       SELECT $1, 'DEMO_DATA_SEEDED', $2::jsonb
       WHERE NOT EXISTS (
         SELECT 1 FROM audit_events WHERE action = 'DEMO_DATA_SEEDED'
       )`,
      [userIds.get("selouna.visser@nwu.ac.za"), JSON.stringify({ accounts: users.length, technicians: 1, tickets: tickets.length })],
    );

    await client.query("COMMIT");
    console.log("Demo data ready: one account for each role and eight workflow tickets.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
