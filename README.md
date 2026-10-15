# CSIS IT Ticket and Log System

A complete local web application based on the supplied CSIS functional, technical, feasibility, business-case and project-plan documents, with the approved PostgreSQL stack:

- React 19 + TypeScript + Vite
- Tailwind CSS and shadcn/Base UI components
- Express 5 + TypeScript
- PostgreSQL 17 in Docker
- Cookie sessions, bcrypt password hashing, rate limiting and role-based access control

## Implemented portals

- **Reporter:** register/sign in, submit a fault, view status and history, add public comments, and review resolutions.
- **Technician:** priority queue, claim tickets, manual walk-in entry, persistent job timer, workflow status, public comments, internal notes, escalation and service calendar.
- **Administrator:** live dashboard, all-ticket search, reporting, CSV export, user creation, role/activation management and permanent audit trail.
- **System administrator:** all administrator functions plus system controls and password-safe operational backup export.

The application also stores escalation hand-offs, notification-outbox records, comments, internal notes, time entries, schedule events and audit events in PostgreSQL. Ticket queues are ordered Critical → High → Medium → Low and then newest first.

Large requests can be divided into technician-created sub-issues. Every child has its own ticket number, assignee, priority, target date, workflow, timer, conversation and audit trail. The parent retains its original age, displays rolled-up completion and work time, and cannot be resolved until every child is resolved. Reporters can view this progress but cannot create child tickets.

## Run locally

From the project root:

```powershell
docker compose up -d
Get-Content -LiteralPath ".\server\db\migrations\001_initial_schema.sql" -Raw | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U csis_dev -d csis_ticketing
Get-Content -LiteralPath ".\server\db\migrations\002_auth_sessions.sql" -Raw | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U csis_dev -d csis_ticketing
Get-Content -LiteralPath ".\server\db\migrations\003_operational_features.sql" -Raw | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U csis_dev -d csis_ticketing
Get-Content -LiteralPath ".\server\db\migrations\004_ticket_sub_issues.sql" -Raw | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U csis_dev -d csis_ticketing
Get-Content -LiteralPath ".\server\db\migrations\005_job_cards.sql" -Raw | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U csis_dev -d csis_ticketing
Get-Content -LiteralPath ".\server\db\migrations\006_ticket_started_notification.sql" -Raw | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U csis_dev -d csis_ticketing
Get-Content -LiteralPath ".\server\db\migrations\007_job_card_walk_ins.sql" -Raw | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U csis_dev -d csis_ticketing
Get-Content -LiteralPath ".\server\db\migrations\007_password_resets.sql" -Raw | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U csis_dev -d csis_ticketing
Get-Content -LiteralPath ".\server\db\migrations\008_email_verification.sql" -Raw | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U csis_dev -d csis_ticketing
Get-Content -LiteralPath ".\server\db\migrations\009_immutable_audit_events.sql" -Raw | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U csis_dev -d csis_ticketing
Get-Content -LiteralPath ".\server\db\migrations\010_job_card_escalation.sql" -Raw | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U csis_dev -d csis_ticketing
Get-Content -LiteralPath ".\server\db\migrations\011_user_account_tombstones.sql" -Raw | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U csis_dev -d csis_ticketing
Get-Content -LiteralPath ".\server\db\migrations\012_assigned_ticket_job_cards.sql" -Raw | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U csis_dev -d csis_ticketing
Get-Content -LiteralPath ".\server\db\migrations\013_reconcile_job_card_timers.sql" -Raw | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U csis_dev -d csis_ticketing
Get-Content -LiteralPath ".\server\db\migrations\014_multiple_active_technician_timers.sql" -Raw | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U csis_dev -d csis_ticketing
Get-Content -LiteralPath ".\server\db\migrations\015_ticket_job_card_departments.sql" -Raw | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U csis_dev -d csis_ticketing
npm --prefix server run seed-demo
```

The final command is required for the demonstration environment. It creates one
login for each role and restores the aged new/open, in-progress, escalated and
resolved tickets used during the demo. It is safe to rerun locally whenever the
demo data needs to be restored.

Start the API in one terminal:

```powershell
Set-Location -LiteralPath ".\server"
npm.cmd install
npm.cmd run dev
```

Start the web app in a second terminal:

```powershell
Set-Location -LiteralPath ".\client"
npm.cmd install
npm.cmd run dev
```

Open `http://127.0.0.1:5173`.

## Development administrator

Create or reset the local development administrator using the credentials in
`.env`:

```powershell
npm --prefix server run seed:dev
```

The default credentials are `dev.admin@mynwu.ac.za` and `Development123!`.
Change them locally if needed; `.env` is not committed.

## Demo accounts

Seed one local account for every application role, together with representative
workflow tickets:

```powershell
npm --prefix server run seed-demo
```

| Role | Name | Email | Password |
| --- | --- | --- | --- |
| System administrator | Selouna Visser | `selouna.visser@mynwu.ac.za` | `SystemAdmin2026!` |
| Administrator | Development Administrator | `dev.admin@mynwu.ac.za` | `Development123!` |
| Technician | Sebastian Klopper | `sebastian.klopper@mynwu.ac.za` | `TechDemo2026!` |
| Student / reporter | Amina Dlamini | `amina.dlamini@mynwu.ac.za` | `StudentDemo2026!` |

These fixed credentials are for local demonstrations only. The seed command is
blocked when `NODE_ENV=production`.

The same seed creates eight demonstration tickets: two new/open, two in
progress, two escalated and two resolved. Their ages range from two hours to six
days so the dashboard, queues, escalation flow and historical reporting all
have representative data. The seed validates this status and age coverage
before writing anything to the database.

The six assigned tickets also receive linked job cards automatically. The seed
adds a projector assessment linked to the Lab G14 ticket and two manually
captured walk-in jobs for Wi-Fi and staff account access. In **Job cards →
Create job card**, choosing a ticket copies its requester, title, description,
technician, category, priority, location and station into the form. Leave
**Linked ticket** set to **No ticket — manual walk-in job** to record a walk-in
request directly; enter the requester's name and the job details manually.
Tickets assigned to a technician also receive a linked job card automatically.
Migration 012 creates cards for existing assignments; future assignments create
or reassign their linked card automatically.

The same seed creates four upcoming service calendar events linked to the
projector, portal access, Lab G30 Wi-Fi and Building G network tickets. Open
**Calendar** as a technician or administrator to see them in the current month
and upcoming agenda. Select an event in the calendar or agenda to view its
details; the creator and administrators can edit and save it.

The Job cards view is a true six-column kanban board: **Pending** (scheduled),
**In progress** (live), **Paused**, **Escalated**, **Resolved** (completed), and
**Cancelled**. Walk-in cards can be escalated with a reason, ended with an end
note, or marked resolved with a completion note; all three actions stop an
active timer and add an immutable audit event.
The badge palette is consistent across the board and detail view: NWU purple
(`#4B2C70`) is used for brand actions, red (`#DC2626`) for pending and high
priority work, amber (`#D97706`) for in-progress work, green (`#16A34A`) for
resolved work, and slate (`#64748B`) for paused or cancelled work.

## First system administrator

Set temporary environment values in the server terminal, run the bootstrap command, and immediately clear the password variable:

```powershell
$env:ADMIN_FULL_NAME = "Your Name"
$env:ADMIN_EMAIL = "your.name@mynwu.ac.za"
$env:ADMIN_PASSWORD = "Use-A-Unique-Password-2026"
npm.cmd run create-admin
Remove-Item Env:ADMIN_PASSWORD
```

The bootstrap is audited. Afterwards, administrators can create users and system administrators can grant every role through the web portal.

## Backups

System administrators can download a password-safe JSON operational snapshot from **System → Export backup**. For a full PostgreSQL SQL backup:

```powershell
.\scripts\backup-database.ps1
```

Backups are written under `backups/`, which is excluded from Git. Schedule this script with Windows Task Scheduler for an automated local backup routine.

## Email notifications

Notification events are written to the persistent `notification_outbox` table.
To deliver them through Gmail, set `SMTP_ENABLED=true` and fill in the SMTP
values in `.env` using a Google app password. Delivery attempts and errors are
recorded in the outbox; failed messages are retried up to five times.

## Verification

```powershell
Set-Location -LiteralPath ".\server"
npm.cmd run build

Set-Location -LiteralPath "..\client"
npm.cmd run build
npm.cmd run lint
```

## User guide

The login page includes a public FAQ and downloads the generated onboarding
guide through `GET /api/resources/user-guide`. Regenerate the PDF after changing
the guide source:

```powershell
python .\scripts\generate-user-guide.py
```

The generated file is written to `output/pdf/csis-it-support-user-guide.pdf`.

## Signup email verification

New self-registered and administrator-created accounts must verify their email
before signing in or accessing ticket APIs. Signup queues a verification email
and does not create a session. Links expire in 24 hours and are single-use;
users can request another from **Resend verification email** on the sign-in page.
Password resets do not bypass email verification.

Apply migrations 006 through 015 after the earlier migrations, before starting
the updated server. Apply 008 once: it preserves access for existing accounts.
New accounts default to unverified. Development seeds and the system-admin
bootstrap explicitly provision trusted accounts with access.

```powershell
Get-Content -LiteralPath ".\server\db\migrations\006_ticket_started_notification.sql" -Raw | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U csis_dev -d csis_ticketing
Get-Content -LiteralPath ".\server\db\migrations\007_password_resets.sql" -Raw | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U csis_dev -d csis_ticketing
Get-Content -LiteralPath ".\server\db\migrations\008_email_verification.sql" -Raw | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U csis_dev -d csis_ticketing
Get-Content -LiteralPath ".\server\db\migrations\009_immutable_audit_events.sql" -Raw | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U csis_dev -d csis_ticketing
Get-Content -LiteralPath ".\server\db\migrations\010_job_card_escalation.sql" -Raw | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U csis_dev -d csis_ticketing
Get-Content -LiteralPath ".\server\db\migrations\011_user_account_tombstones.sql" -Raw | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U csis_dev -d csis_ticketing
Get-Content -LiteralPath ".\server\db\migrations\012_assigned_ticket_job_cards.sql" -Raw | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U csis_dev -d csis_ticketing
Get-Content -LiteralPath ".\server\db\migrations\013_reconcile_job_card_timers.sql" -Raw | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U csis_dev -d csis_ticketing
Get-Content -LiteralPath ".\server\db\migrations\014_multiple_active_technician_timers.sql" -Raw | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U csis_dev -d csis_ticketing
Get-Content -LiteralPath ".\server\db\migrations\015_ticket_job_card_departments.sql" -Raw | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U csis_dev -d csis_ticketing
```

Set `APP_BASE_URL` to the externally accessible frontend URL and configure
`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` and `MAIL_FROM` in `.env`.
The API's existing notification worker delivers verification emails through SMTP.
Without SMTP configuration, emails remain queued and new users cannot verify.
Run `npm --prefix server test` for the authentication integration tests.

Audit events are append-only. PostgreSQL rejects direct `UPDATE`, `DELETE` and
`TRUNCATE` operations on `audit_events`, and historical actor/ticket UUIDs
remain in the audit row even after the referenced record is removed.
