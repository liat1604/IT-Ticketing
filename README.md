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
```

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

## First system administrator

Set temporary environment values in the server terminal, run the bootstrap command, and immediately clear the password variable:

```powershell
$env:ADMIN_FULL_NAME = "Your Name"
$env:ADMIN_EMAIL = "your.name@nwu.ac.za"
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

## Email integration boundary

Notification events are written to the persistent `notification_outbox` table. Delivery is deliberately not connected to an external NWU mail relay until authorised SMTP host, sender identity, credentials and data-handling approval are supplied. No ticket contents are transmitted outside the local system by default.

## Verification

```powershell
Set-Location -LiteralPath ".\server"
npm.cmd run build

Set-Location -LiteralPath "..\client"
npm.cmd run build
npm.cmd run lint
```
