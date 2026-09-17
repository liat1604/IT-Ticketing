# Ticketing System

A full-stack service-desk ticketing application with a React/Vite client, an Express/TypeScript API, and PostgreSQL.

## Prerequisites

- Node.js and npm
- Docker Desktop with Docker Compose

## Local setup

1. Copy `.env.example` to `.env` and choose a local database password.
2. Start PostgreSQL:

   ```powershell
   docker compose up -d db
   ```

3. Apply the database migrations:

   ```powershell
   Get-Content server/db/migrations/001_initial_schema.sql | docker compose exec -T db psql -U csis_dev -d csis_ticketing
   Get-Content server/db/migrations/002_auth_sessions.sql | docker compose exec -T db psql -U csis_dev -d csis_ticketing
   ```

4. Install dependencies and start the API:

   ```powershell
   npm --prefix server install
   npm --prefix server run dev
   ```

5. In a second terminal, start the client:

   ```powershell
   npm --prefix client install
   npm --prefix client run dev
   ```

6. Create or reset the local development administrator:

   ```powershell
   npm --prefix server run seed:dev
   ```

   The default credentials from `.env` are `dev.admin@nwu.ac.za` and
   `Development123!`. Change them locally if needed; `.env` is not committed.

The client is served by Vite and proxies `/api` requests to `http://127.0.0.1:3001`.

## Build

```powershell
npm --prefix client run build
npm --prefix server run build
```

Local environment files, dependency folders, logs, and build outputs are excluded from Git.
