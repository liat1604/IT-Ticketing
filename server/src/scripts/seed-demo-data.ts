import "dotenv/config";
import { hash } from "bcryptjs";
import type { PoolClient } from "pg";

import { pool } from "../db.js";
import type { Department } from "../domain/departments.js";

type UserRole = "REPORTER" | "TECHNICIAN" | "ADMIN" | "SYSTEM_ADMIN";
type TicketStatus = "NEW" | "ASSIGNED" | "IN_PROGRESS" | "ESCALATED" | "RESOLVED";
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
  department: Department;
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

type DemoCalendarEvent = {
  ticketKey: string;
  title: string;
  eventType: "SLA" | "SITE_VISIT" | "MAINTENANCE" | "FOLLOW_UP";
  startsInHours: number;
  durationMinutes: number;
  location: string;
  notes: string;
};

type DemoWalkIn = {
  title: string;
  description: string;
  category: string;
  department: Department;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  location: string;
  locationDetails: string;
  stationReference: string;
  reporterName: string;
  reporterEmail: string;
  targetInHours: number;
  checklist: string[];
};

type DemoSubIssue = {
  parentTicketKey: string;
  title: string;
  description: string;
  category: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  dueInHours: number;
};

const users: SeedUser[] = [
  {
    fullName: "Selouna Visser",
    email: "selouna.visser@mynwu.ac.za",
    password: "SystemAdmin2026!",
    role: "SYSTEM_ADMIN",
  },
  {
    fullName: "Development Administrator",
    email: "dev.admin@mynwu.ac.za",
    password: "Development123!",
    role: "ADMIN",
  },
  {
    fullName: "Sebastian Klopper",
    email: "sebastian.klopper@mynwu.ac.za",
    password: "TechDemo2026!",
    role: "TECHNICIAN",
  },
  {
    fullName: "Amina Dlamini",
    email: "amina.dlamini@mynwu.ac.za",
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
    department: "CSIS",
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
    department: "Statistics",
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
    department: "CSIS",
    location: "Lab G30",
    locationDetails: "Rows B to D",
    priority: "HIGH",
    status: "IN_PROGRESS",
    technicianEmail: "sebastian.klopper@mynwu.ac.za",
    ageHours: 18,
  },
  {
    key: "DEMO-MATLAB-LICENCE",
    title: "MATLAB licence activation failure",
    description: "MATLAB reports that the campus licence server cannot be reached on several laboratory computers.",
    category: "Software",
    department: "Mathematics",
    location: "Lab G14",
    locationDetails: "Stations 20 to 26",
    priority: "MEDIUM",
    status: "IN_PROGRESS",
    technicianEmail: "sebastian.klopper@mynwu.ac.za",
    ageHours: 26,
  },
  {
    key: "DEMO-CORE-SWITCH",
    title: "Core switch packet loss in Building G",
    description: "Monitoring shows sustained packet loss affecting multiple teaching laboratories and staff offices.",
    category: "Network",
    department: "CSIS",
    location: "Building G",
    locationDetails: "Distribution cabinet G-02",
    priority: "CRITICAL",
    status: "ESCALATED",
    technicianEmail: "sebastian.klopper@mynwu.ac.za",
    ageHours: 30,
    escalationReason: "The fault affects the building distribution layer and requires Central IT network engineering access.",
    externalReference: "NWU-CT-2026-104",
  },
  {
    key: "DEMO-LAB-LOCKOUTS",
    title: "Repeated account lockouts across lab PCs",
    description: "Multiple valid student accounts are being locked immediately after attempting to sign in to domain workstations.",
    category: "Access",
    department: "Statistics",
    location: "Lab G30",
    locationDetails: "All student stations",
    priority: "HIGH",
    status: "ESCALATED",
    technicianEmail: "sebastian.klopper@mynwu.ac.za",
    ageHours: 48,
    escalationReason: "The issue appears to originate from central identity policy and cannot be corrected within CSIS permissions.",
    externalReference: "NWU-CT-2026-105",
  },
  {
    key: "DEMO-KEYBOARD-12",
    title: "Faulty keyboard at Station 12",
    description: "Several keys were unresponsive and prevented the workstation from being used for practical work.",
    category: "Hardware",
    department: "Mathematics",
    location: "Lab G14",
    locationDetails: "Station 12",
    priority: "LOW",
    status: "RESOLVED",
    technicianEmail: "sebastian.klopper@mynwu.ac.za",
    ageHours: 96,
    resolutionSummary: "Replaced the keyboard, tested all keys and returned the station to service.",
  },
  {
    key: "DEMO-UPS-OVERHEAT",
    title: "UPS overheating warning in server room",
    description: "The monitoring panel reported elevated temperature and an audible warning from the secondary UPS.",
    category: "Physical Hazard",
    department: "CSIS",
    location: "Server Room",
    locationDetails: "Secondary UPS rack",
    priority: "CRITICAL",
    status: "RESOLVED",
    technicianEmail: "sebastian.klopper@mynwu.ac.za",
    ageHours: 144,
    resolutionSummary: "Isolated the affected UPS, cleared the blocked ventilation path and confirmed stable operating temperature.",
  },
  {
    key: "DEMO-STATISTICS-PRINTER",
    title: "Statistics lab printer queue keeps stopping",
    description: "Print jobs remain queued after the printer reports ready, affecting practical handouts for the Statistics lab.",
    category: "Hardware",
    department: "Statistics",
    location: "Lab G30",
    locationDetails: "Statistics practical room printer",
    priority: "HIGH",
    status: "IN_PROGRESS",
    technicianEmail: "sebastian.klopper@mynwu.ac.za",
    ageHours: 9,
  },
  {
    key: "DEMO-MATH-LICENCE-RENEWAL",
    title: "Mathematics lab software licence renewal",
    description: "Several Mathematics workstations report that the installed analysis software cannot validate its campus licence.",
    category: "Software",
    department: "Mathematics",
    location: "Lab G14",
    locationDetails: "Workstations 20 to 26",
    priority: "MEDIUM",
    status: "ASSIGNED",
    technicianEmail: "sebastian.klopper@mynwu.ac.za",
    ageHours: 12,
  },
  {
    key: "DEMO-CSIS-LECTERN-AUDIO",
    title: "No audio output from the CSIS lecture lectern",
    description: "The lectern computer is detected by the display, but audio does not reach the room speakers during lectures.",
    category: "Hardware",
    department: "CSIS",
    location: "Lab G14",
    locationDetails: "Front lectern audio connection",
    priority: "MEDIUM",
    status: "NEW",
    ageHours: 4,
  },
  {
    key: "DEMO-STATISTICS-MFA-LOOP",
    title: "Statistics portal sign-in repeats the MFA prompt",
    description: "After approving the multi-factor prompt, the Statistics portal returns to the sign-in screen instead of opening the dashboard.",
    category: "Access",
    department: "Statistics",
    location: "Online",
    locationDetails: "Statistics portal dashboard",
    priority: "HIGH",
    status: "NEW",
    ageHours: 6,
  },
  {
    key: "DEMO-MATH-SHARED-DRIVE",
    title: "Mathematics course materials drive is unavailable",
    description: "Staff can sign in successfully but cannot open the shared drive containing current course materials.",
    category: "Access",
    department: "Mathematics",
    location: "Building G",
    locationDetails: "Mathematics staff office",
    priority: "HIGH",
    status: "ASSIGNED",
    technicianEmail: "sebastian.klopper@mynwu.ac.za",
    ageHours: 11,
  },
  {
    key: "DEMO-CSIS-BACKUP-RESTORE",
    title: "CSIS file server backup restore request",
    description: "A project folder was accidentally overwritten and needs to be restored from the latest available backup.",
    category: "Software",
    department: "CSIS",
    location: "Server Room",
    locationDetails: "CSIS file server backup volume",
    priority: "MEDIUM",
    status: "NEW",
    ageHours: 3,
  },
];

const requiredTicketStatuses: TicketStatus[] = [
  "NEW",
  "ASSIGNED",
  "IN_PROGRESS",
  "ESCALATED",
  "RESOLVED",
];

const demoCalendarEvents: DemoCalendarEvent[] = [
  {
    ticketKey: "DEMO-PROJECTOR-G14",
    title: "Projector inspection",
    eventType: "SITE_VISIT",
    startsInHours: 2,
    durationMinutes: 60,
    location: "Lab G14",
    notes: "Check the lectern output, cable connections and projector input.",
  },
  {
    ticketKey: "DEMO-PORTAL-ACCESS",
    title: "Student portal access follow-up",
    eventType: "FOLLOW_UP",
    startsInHours: 26,
    durationMinutes: 30,
    location: "Online",
    notes: "Confirm the student can sign in after the access policy review.",
  },
  {
    ticketKey: "DEMO-WIFI-G30",
    title: "Wi-Fi stability review",
    eventType: "SLA",
    startsInHours: 50,
    durationMinutes: 45,
    location: "Lab G30",
    notes: "Review connection logs and verify stability across the affected rows.",
  },
  {
    ticketKey: "DEMO-CORE-SWITCH",
    title: "Building G network escalation update",
    eventType: "FOLLOW_UP",
    startsInHours: 74,
    durationMinutes: 30,
    location: "Building G",
    notes: "Check the Central IT escalation and update the linked ticket.",
  },
  {
    ticketKey: "DEMO-STATISTICS-PRINTER",
    title: "Statistics printer queue inspection",
    eventType: "SITE_VISIT",
    startsInHours: 30,
    durationMinutes: 45,
    location: "Lab G30",
    notes: "Inspect the printer queue, spooler service and a sample of test prints.",
  },
  {
    ticketKey: "DEMO-MATH-LICENCE-RENEWAL",
    title: "Mathematics licence validation follow-up",
    eventType: "FOLLOW_UP",
    startsInHours: 54,
    durationMinutes: 30,
    location: "Lab G14",
    notes: "Confirm the campus licence validates on the affected Mathematics workstations.",
  },
  {
    ticketKey: "DEMO-STATISTICS-MFA-LOOP",
    title: "Statistics portal MFA review",
    eventType: "FOLLOW_UP",
    startsInHours: 78,
    durationMinutes: 30,
    location: "Online",
    notes: "Review the sign-in flow and confirm the portal opens after MFA approval.",
  },
  {
    ticketKey: "DEMO-MATH-SHARED-DRIVE",
    title: "Mathematics shared drive access check",
    eventType: "SITE_VISIT",
    startsInHours: 102,
    durationMinutes: 45,
    location: "Building G",
    notes: "Verify staff access to the course materials drive from the Mathematics office.",
  },
  {
    ticketKey: "DEMO-CSIS-BACKUP-RESTORE",
    title: "CSIS backup restore review",
    eventType: "MAINTENANCE",
    startsInHours: 126,
    durationMinutes: 60,
    location: "Server Room",
    notes: "Review the latest backup and validate the requested project-folder restore point.",
  },
];

const demoWalkIns: DemoWalkIn[] = [
  {
    title: "Walk-in laptop Wi-Fi configuration",
    description: "Configure the student laptop for secure campus Wi-Fi and verify access.",
    category: "Network",
    department: "CSIS",
    priority: "LOW",
    location: "Building G",
    locationDetails: "CSIS help desk",
    stationReference: "Personal laptop",
    reporterName: "Thabo Molefe",
    reporterEmail: "thabo.molefe@mynwu.ac.za",
    targetInHours: 2,
    checklist: ["Configure secure Wi-Fi profile", "Confirm internet access with the requester"],
  },
  {
    title: "Walk-in staff account access",
    description: "Restore access to the staff workstation and confirm the account can open required systems.",
    category: "Access",
    department: "Statistics",
    priority: "MEDIUM",
    location: "Building G",
    locationDetails: "CSIS service counter",
    stationReference: "Staff workstation F-08",
    reporterName: "Naledi Khumalo",
    reporterEmail: "naledi.khumalo@mynwu.ac.za",
    targetInHours: 6,
    checklist: ["Check account status", "Confirm workstation sign-in and required system access"],
  },
];

const demoSubIssues: DemoSubIssue[] = [
  {
    parentTicketKey: "DEMO-WIFI-G30",
    title: "Inspect access point uplink in Lab G30",
    description: "Check the access point uplink, switch port errors and signal stability for the affected lab rows.",
    category: "Network",
    priority: "HIGH",
    dueInHours: 5,
  },
  {
    parentTicketKey: "DEMO-WIFI-G30",
    title: "Test Wi-Fi roaming across Lab G30",
    description: "Verify roaming and reconnect behavior on representative student workstations in rows B to D.",
    category: "Network",
    priority: "MEDIUM",
    dueInHours: 10,
  },
  {
    parentTicketKey: "DEMO-CORE-SWITCH",
    title: "Collect packet-loss samples in Building G",
    description: "Capture packet-loss measurements from the distribution cabinet and two affected teaching labs.",
    category: "Network",
    priority: "CRITICAL",
    dueInHours: 3,
  },
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

  const seededDepartments = new Set(tickets.map((ticket) => ticket.department));
  for (const department of ["CSIS", "Statistics", "Mathematics"] satisfies Department[]) {
    if (!seededDepartments.has(department)) {
      throw new Error(`Demo tickets are missing department: ${department}`);
    }
  }
}

async function upsertUser(
  client: PoolClient,
  user: SeedUser,
) {
  const passwordHash = await hash(user.password, 12);
  const result = await client.query<{ id: string }>(
    `INSERT INTO users (full_name, email, password_hash, role, is_active, email_verified_at)
     VALUES ($1, $2, $3, $4, TRUE, CURRENT_TIMESTAMP)
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

    const legacyDemoEmails = [
      ["selouna.visser@nwu.ac.za", "selouna.visser@mynwu.ac.za"],
      ["dev.admin@nwu.ac.za", "dev.admin@mynwu.ac.za"],
      ["sebastian.klopper@nwu.ac.za", "sebastian.klopper@mynwu.ac.za"],
      ["amina.dlamini@student.g.nwu.ac.za", "amina.dlamini@mynwu.ac.za"],
    ] as const;

    for (const [legacyEmail, currentEmail] of legacyDemoEmails) {
      await client.query(
        `UPDATE users
         SET email = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE LOWER(email) = $1
           AND NOT EXISTS (
             SELECT 1 FROM users existing WHERE LOWER(existing.email) = $2
           )`,
        [legacyEmail, currentEmail],
      );
    }

    const oldTechnician = await client.query<{ id: string }>(
      `SELECT id FROM users WHERE LOWER(email) = 'technician.test@mynwu.ac.za'`,
    );
    const existingLerato = await client.query<{ id: string }>(
      `SELECT id FROM users WHERE LOWER(email) = 'lerato.mokoena@mynwu.ac.za'`,
    );

    if (oldTechnician.rows[0] && !existingLerato.rows[0]) {
      await client.query(
        `UPDATE users
         SET full_name = 'Lerato Mokoena',
             email = 'lerato.mokoena@mynwu.ac.za',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [oldTechnician.rows[0].id],
      );
    }

    const userIds = new Map<string, string>();
    for (const user of users) {
      userIds.set(user.email, await upsertUser(client, user));
    }

    const reporterEmail = "amina.dlamini@mynwu.ac.za";
    const reporterId = userIds.get(reporterEmail);
    if (!reporterId) throw new Error("The seeded student reporter account is required");
    const reporter = { id: reporterId, email: reporterEmail };

    const ticketIds = new Map<string, string>();
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
               department = $14,
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
             reporter_id, created_by, assigned_to, category_id, department, location_id,
             location_details, station_reference, title, description,
             priority, status, source, resolution_summary, resolved_at,
             created_at, updated_at
           )
           SELECT
             $1, $1, $2, categories.id, $14, locations.id,
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
          ticket.department,
        ],
      );
      const seeded = ticketResult.rows[0];
      if (!seeded) throw new Error(`Could not seed ${ticket.key}`);
      ticketIds.set(ticket.key, seeded.id);

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

    }

    const technicianId = userIds.get("sebastian.klopper@mynwu.ac.za");
    const linkedTicketId = ticketIds.get("DEMO-PROJECTOR-G14");
    if (!technicianId || !linkedTicketId) {
      throw new Error("The seeded technician and linked job-card ticket are required");
    }

    for (const subIssue of demoSubIssues) {
      const parentId = ticketIds.get(subIssue.parentTicketKey);
      if (!parentId) {
        throw new Error(`Could not find parent ticket for sub-issue: ${subIssue.title}`);
      }

      const childResult = await client.query<{ id: string; ticket_number: string }>(
        `WITH updated AS (
           UPDATE tickets AS child
           SET reporter_id = $1,
               created_by = $2,
               assigned_to = $2,
               category_id = categories.id,
               department = parent.department,
               location_id = parent.location_id,
               location_details = parent.location_details,
               title = $4,
               description = $5,
               priority = $6::ticket_priority,
               status = 'ASSIGNED',
               source = parent.source,
               due_at = CURRENT_TIMESTAMP + ($7 * INTERVAL '1 hour'),
               updated_at = CURRENT_TIMESTAMP
           FROM tickets AS parent, categories
           WHERE child.parent_ticket_id = parent.id
             AND parent.id = $3
             AND child.title = $4
             AND categories.name = $8
           RETURNING child.id, child.ticket_number
         ),
         inserted AS (
           INSERT INTO tickets (
             reporter_id, created_by, assigned_to, category_id, department,
             location_id, location_details, title, description, priority,
             status, source, parent_ticket_id, due_at
           )
           SELECT
             $1, $2, $2, categories.id, parent.department,
             parent.location_id, parent.location_details, $4, $5,
             $6::ticket_priority, 'ASSIGNED', parent.source, parent.id,
             CURRENT_TIMESTAMP + ($7 * INTERVAL '1 hour')
           FROM tickets AS parent, categories
           WHERE parent.id = $3
             AND categories.name = $8
             AND NOT EXISTS (SELECT 1 FROM updated)
             AND NOT EXISTS (
               SELECT 1 FROM tickets AS existing
               WHERE existing.parent_ticket_id = parent.id
                 AND existing.title = $4
             )
           RETURNING id, ticket_number
         )
         SELECT id, ticket_number FROM updated
         UNION ALL
         SELECT id, ticket_number FROM inserted
         LIMIT 1`,
        [
          reporter.id,
          technicianId,
          parentId,
          subIssue.title,
          subIssue.description,
          subIssue.priority,
          subIssue.dueInHours,
          subIssue.category,
        ],
      );
      const child = childResult.rows[0];
      if (!child) throw new Error(`Could not seed sub-issue: ${subIssue.title}`);

      await client.query(
        `INSERT INTO audit_events (ticket_id, actor_id, action, new_values)
         SELECT $1, $2, 'SUB_ISSUE_CREATED', $3::jsonb
         WHERE NOT EXISTS (
           SELECT 1 FROM audit_events
           WHERE ticket_id = $1
             AND action = 'SUB_ISSUE_CREATED'
             AND new_values->>'childTicketId' = $4
         )`,
        [
          parentId,
          technicianId,
          JSON.stringify({
            childTicketId: child.id,
            ticketNumber: child.ticket_number,
            title: subIssue.title,
            seed: true,
          }),
          child.id,
        ],
      );
      await client.query(
        `INSERT INTO audit_events (ticket_id, actor_id, action, new_values)
         SELECT $1, $2, 'TICKET_CREATED', $3::jsonb
         WHERE NOT EXISTS (
           SELECT 1 FROM audit_events
           WHERE ticket_id = $1 AND action = 'TICKET_CREATED'
         )`,
        [
          child.id,
          technicianId,
          JSON.stringify({
            parentTicketId: parentId,
            status: "ASSIGNED",
            priority: subIssue.priority,
            seed: true,
          }),
        ],
      );
    }

    for (const event of demoCalendarEvents) {
      const ticketId = ticketIds.get(event.ticketKey);
      if (!ticketId) {
        throw new Error(`Could not find linked ticket for calendar event: ${event.title}`);
      }

      const startsAt = new Date(Date.now() + event.startsInHours * 60 * 60 * 1000);
      const endsAt = new Date(startsAt.getTime() + event.durationMinutes * 60 * 1000);

      await client.query(
        `WITH updated AS (
           UPDATE schedule_events
           SET event_type = $2,
               starts_at = $3,
               ends_at = $4,
               location = $5,
               notes = $6,
               assigned_to = $8,
               created_by = $8,
               updated_at = CURRENT_TIMESTAMP
           WHERE title = $1
             AND ticket_id = $7
           RETURNING id
         ),
         inserted AS (
           INSERT INTO schedule_events (
             title, event_type, starts_at, ends_at, location, notes,
             ticket_id, assigned_to, created_by
           )
           SELECT $1, $2, $3, $4, $5, $6, $7, $8, $8
           WHERE NOT EXISTS (SELECT 1 FROM updated)
           RETURNING id
         )
         SELECT id FROM updated
         UNION ALL
         SELECT id FROM inserted
         LIMIT 1`,
        [
          event.title,
          event.eventType,
          startsAt,
          endsAt,
          event.location,
          event.notes,
          ticketId,
          technicianId,
        ],
      );
    }

    const linkedJobCard = await client.query<{ id: string }>(
      `WITH updated AS (
         UPDATE job_cards
         SET assigned_to = $2,
             created_by = $2,
             title = 'Projector assessment in Lab G14',
             description = tickets.description,
             category_id = tickets.category_id,
             department = tickets.department,
             priority = tickets.priority,
             location_id = tickets.location_id,
             location_details = tickets.location_details,
             station_reference = tickets.station_reference,
             walk_in_reporter_name = NULL,
             walk_in_reporter_email = NULL,
             updated_at = CURRENT_TIMESTAMP
         FROM tickets
         WHERE job_cards.primary_ticket_id = $1
           AND job_cards.title = 'Projector assessment in Lab G14'
           AND tickets.id = $1
         RETURNING job_cards.id
       ),
       inserted AS (
         INSERT INTO job_cards (
           primary_ticket_id, assigned_to, created_by, title, description,
           category_id, department, priority, location_id, location_details,
           station_reference, target_at
         )
         SELECT
           tickets.id, $2, $2, 'Projector assessment in Lab G14',
           tickets.description, tickets.category_id, tickets.department, tickets.priority,
           tickets.location_id, tickets.location_details,
           tickets.station_reference, CURRENT_TIMESTAMP + INTERVAL '8 hours'
         FROM tickets
         WHERE tickets.id = $1
           AND NOT EXISTS (SELECT 1 FROM updated)
         RETURNING id
       )
       SELECT id FROM updated
       UNION ALL
       SELECT id FROM inserted
       LIMIT 1`,
      [linkedTicketId, technicianId],
    );

    const walkInJobCards: Array<{ id: string; checklist: string[] }> = [];
    for (const walkIn of demoWalkIns) {
      const jobCard = await client.query<{ id: string }>(
        `WITH updated AS (
           UPDATE job_cards
           SET primary_ticket_id = NULL,
               assigned_to = $1,
               created_by = $1,
               description = $3,
               category_id = categories.id,
               department = $12,
               priority = $5::ticket_priority,
               location_id = locations.id,
               location_details = $7,
               station_reference = $8,
               walk_in_reporter_name = $9,
               walk_in_reporter_email = $10,
               target_at = CURRENT_TIMESTAMP + ($11 * INTERVAL '1 hour'),
               updated_at = CURRENT_TIMESTAMP
           FROM categories, locations
           WHERE job_cards.title = $2
             AND job_cards.primary_ticket_id IS NULL
             AND categories.name = $4
             AND locations.name = $6
           RETURNING job_cards.id
         ),
         inserted AS (
           INSERT INTO job_cards (
             primary_ticket_id, assigned_to, created_by, title, description,
             category_id, priority, location_id, location_details,
             station_reference, walk_in_reporter_name, walk_in_reporter_email, department,
             target_at
           )
           SELECT
             NULL, $1, $1, $2, $3, categories.id, $5::ticket_priority,
             locations.id, $7, $8, $9, $10, $12,
             CURRENT_TIMESTAMP + ($11 * INTERVAL '1 hour')
           FROM categories, locations
           WHERE categories.name = $4
             AND locations.name = $6
             AND NOT EXISTS (SELECT 1 FROM updated)
           RETURNING id
         )
         SELECT id FROM updated
         UNION ALL
         SELECT id FROM inserted
         LIMIT 1`,
        [
          technicianId,
          walkIn.title,
          walkIn.description,
          walkIn.category,
          walkIn.priority,
          walkIn.location,
          walkIn.locationDetails,
          walkIn.stationReference,
          walkIn.reporterName,
          walkIn.reporterEmail,
          walkIn.targetInHours,
          walkIn.department,
        ],
      );
      const id = jobCard.rows[0]?.id;
      if (!id) throw new Error(`Could not seed walk-in job: ${walkIn.title}`);
      walkInJobCards.push({ id, checklist: walkIn.checklist });
    }

    for (const [jobCardId, items] of [
      [linkedJobCard.rows[0]?.id, ["Inspect projector input and cabling", "Test the lectern display output"]],
      ...walkInJobCards.map(({ id, checklist }) => [id, checklist] as const),
    ] as const) {
      if (!jobCardId) throw new Error("Could not seed demo job card");
      for (const [position, body] of items.entries()) {
        await client.query(
          `INSERT INTO job_card_checklist_items (job_card_id, body, position)
           SELECT $1, $2, $3
           WHERE NOT EXISTS (
             SELECT 1 FROM job_card_checklist_items
             WHERE job_card_id = $1 AND body = $2
           )`,
          [jobCardId, body, position],
        );
      }
    }

    await client.query(
      `UPDATE job_cards AS jc
       SET status = 'PAUSED', updated_at = CURRENT_TIMESTAMP
       WHERE jc.primary_ticket_id = ANY($1::uuid[])
         AND jc.status = 'LIVE'
         AND NOT EXISTS (
           SELECT 1 FROM time_entries AS te
           WHERE te.stopped_at IS NULL
             AND (
               te.job_card_id = jc.id
               OR (te.job_card_id IS NULL AND te.ticket_id = jc.primary_ticket_id)
             )
         )`,
      [[...tickets.filter((ticket) => ticket.status === "IN_PROGRESS")
        .map((ticket) => ticketIds.get(ticket.key))
        .filter((id): id is string => Boolean(id))]],
    );

    // Older seed runs created synthetic outbox events. Remove them so restoring
    // local demo data never sends sample ticket emails to demonstration users.
    await client.query(
      "DELETE FROM notification_outbox WHERE LEFT(event_type, 5) = 'DEMO_'",
    );

    await client.query(
      `INSERT INTO audit_events (actor_id, action, new_values)
       SELECT $1, 'DEMO_DATA_SEEDED', $2::jsonb
       WHERE NOT EXISTS (
         SELECT 1 FROM audit_events WHERE action = 'DEMO_DATA_SEEDED'
       )`,
      [userIds.get("selouna.visser@mynwu.ac.za"), JSON.stringify({ accounts: users.length, technicians: 1, tickets: tickets.length })],
    );

    await client.query("COMMIT");
    console.log(`Demo data ready: one account per role, ${tickets.length} workflow tickets, ticket-linked job cards, ${demoWalkIns.length} walk-in jobs, and ${demoCalendarEvents.length} ticket appointments.`);
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
