import { createHash, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import cookieParser from "cookie-parser";
import express from "express";
import type { Server } from "node:http";
import { pool } from "../db.js";
import { adminRouter } from "../routes/admin.js";
import { authRouter } from "../routes/auth.js";

let server: Server;
let baseUrl = "";
const userIds: string[] = [];
const emails: string[] = [];
const ticketIds: string[] = [];

before(async () => {
  const app = express();
  app.use(express.json(), cookieParser());
  app.use("/api/admin", adminRouter);
  app.use("/api/auth", authRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("No test server");
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

after(async () => {
  await pool.query(`DELETE FROM notification_outbox WHERE recipient_email = ANY($1::text[])`, [emails]);
  await pool.query(`DELETE FROM tickets WHERE id = ANY($1::uuid[])`, [ticketIds]);
  await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [userIds]);
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await pool.end();
});

async function account(role = "REPORTER") {
  const email = `delete-${randomUUID()}@mynwu.ac.za`;
  const result = await pool.query<{ id: string }>(
    `INSERT INTO users(email, full_name, password_hash, role, email_verified_at)
     VALUES ($1, 'Deletion Test', 'unused-test-hash', $2, CURRENT_TIMESTAMP) RETURNING id`, [email, role],
  );
  const id = result.rows[0].id;
  userIds.push(id);
  emails.push(email);
  const token = randomUUID();
  await pool.query(
    `INSERT INTO sessions(user_id, token_hash, expires_at) VALUES($1,$2,CURRENT_TIMESTAMP + INTERVAL '1 hour')`,
    [id, createHash("sha256").update(token).digest("hex")],
  );
  return { id, email, cookie: `csis_session=${token}` };
}

function remove(id: string, cookie?: string) {
  return fetch(`${baseUrl}/api/admin/users/${id}`, { method: "DELETE", headers: cookie ? { cookie } : {} });
}

function deactivate(id: string, cookie: string) {
  return fetch(`${baseUrl}/api/admin/users/${id}`, {
    method: "PATCH",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ isActive: false }),
  });
}

test("deletion requires an administrator, valid ID and another account", async () => {
  const reporter = await account();
  const admin = await account("ADMIN");
  assert.equal((await remove(reporter.id)).status, 401);
  assert.equal((await remove(admin.id, reporter.cookie)).status, 403);
  assert.equal((await remove("invalid", admin.cookie)).status, 400);
  assert.equal((await remove(randomUUID(), admin.cookie)).status, 404);
  assert.equal((await remove(admin.id, admin.cookie)).status, 409);
});

test("only a system administrator can delete another system administrator", async () => {
  const admin = await account("ADMIN");
  const system = await account("SYSTEM_ADMIN");
  const target = await account("SYSTEM_ADMIN");
  assert.equal((await remove(target.id, admin.cookie)).status, 403);
  assert.equal((await remove(target.id, system.cookie)).status, 204);
});

test("deleting an unused account removes access and credentials while preserving audit history", async () => {
  const admin = await account("ADMIN");
  const target = await account();
  const audit = await pool.query<{ id: number }>(
    `INSERT INTO audit_events(actor_id, action) VALUES($1,'LOGIN_SUCCESS') RETURNING id`,
    [target.id],
  );
  for (const table of ["email_verification_tokens", "password_reset_tokens"]) {
    await pool.query(
      `INSERT INTO ${table}(user_id, token_hash, expires_at) VALUES($1,$2,CURRENT_TIMESTAMP + INTERVAL '1 hour')`,
      [target.id, randomUUID()],
    );
  }
  await pool.query(
    `INSERT INTO notification_outbox(recipient_email,event_type,payload) VALUES($1,'EMAIL_VERIFICATION_REQUESTED','{}')`,
    [target.email],
  );

  assert.equal((await remove(target.id, admin.cookie)).status, 204);
  for (const table of ["sessions", "email_verification_tokens", "password_reset_tokens"]) {
    assert.equal((await pool.query(`SELECT 1 FROM ${table} WHERE user_id=$1`, [target.id])).rowCount, 0);
  }
  const tombstone = await pool.query<{ email: string; full_name: string; is_active: boolean; deleted_at: Date | null }>(
    `SELECT email, full_name, is_active, deleted_at FROM users WHERE id=$1`,
    [target.id],
  );
  assert.deepEqual(tombstone.rows[0], {
    email: `deleted+${target.id}@invalid.local`,
    full_name: "Deleted account",
    is_active: false,
    deleted_at: tombstone.rows[0].deleted_at,
  });
  assert.ok(tombstone.rows[0].deleted_at);
  assert.equal((await pool.query(`SELECT 1 FROM notification_outbox WHERE recipient_email=$1`, [target.email])).rowCount, 0);
  assert.equal((await fetch(`${baseUrl}/api/auth/me`, { headers: { cookie: target.cookie } })).status, 401);

  const preserved = await pool.query(`SELECT actor_id, previous_values FROM audit_events WHERE id=$1`, [audit.rows[0].id]);
  assert.equal(preserved.rows[0].actor_id, target.id);
  assert.equal(preserved.rows[0].previous_values, null);
  const deletion = await pool.query(
    `SELECT previous_values FROM audit_events
     WHERE actor_id=$1 AND action='USER_DELETED_BY_ADMIN' AND previous_values->>'userId'=$2`,
    [admin.id, target.id],
  );
  assert.equal(deletion.rowCount, 1);
  assert.equal(deletion.rows[0].previous_values.email, target.email);

  const listed = await fetch(`${baseUrl}/api/admin/users?search=${encodeURIComponent(target.email)}`, {
    headers: { cookie: admin.cookie },
  });
  assert.equal((await listed.json() as { users: Array<{ id: string }> }).users.some(user => user.id === target.id), false);
  const auditLog = await fetch(`${baseUrl}/api/admin/audit?limit=250`, { headers: { cookie: admin.cookie } });
  const historicalActor = (await auditLog.json() as { events: Array<{ id: number; actorName: string | null }> })
    .events.find(event => event.id === audit.rows[0].id);
  assert.equal(historicalActor?.actorName, "Deletion Test");
  assert.equal((await remove(target.id, admin.cookie)).status, 404);
});

test("open tickets prevent both deactivation and deletion", async () => {
  const admin = await account("ADMIN");
  const target = await account();
  const category = await pool.query(`SELECT id FROM categories ORDER BY id LIMIT 1`);
  const ticket = await pool.query<{ id: string }>(
    `INSERT INTO tickets(reporter_id,created_by,category_id,title,description,priority,status,source)
     VALUES($1,$1,$2,'Deletion test','Keep the reporter active while work is open','MEDIUM','NEW','WEB')
     RETURNING id`,
    [target.id, category.rows[0].id],
  );
  ticketIds.push(ticket.rows[0].id);

  const deletion = await remove(target.id, admin.cookie);
  assert.equal(deletion.status, 409);
  assert.match((await deletion.json() as { error: string }).error, /open tickets/i);
  const deactivation = await deactivate(target.id, admin.cookie);
  assert.equal(deactivation.status, 409);
  assert.match((await deactivation.json() as { error: string }).error, /open tickets/i);
  assert.equal((await pool.query(`SELECT is_active FROM users WHERE id=$1`, [target.id])).rows[0].is_active, true);
  assert.equal((await fetch(`${baseUrl}/api/auth/me`, { headers: { cookie: target.cookie } })).status, 200);
});

test("deleting an account with resolved tickets retains ticket and comment history", async () => {
  const admin = await account("ADMIN");
  const target = await account();
  const category = await pool.query(`SELECT id FROM categories ORDER BY id LIMIT 1`);
  const ticket = await pool.query<{ id: string }>(
    `INSERT INTO tickets(reporter_id,created_by,category_id,title,description,priority,status,source)
     VALUES($1,$1,$2,'Resolved history','Historical ticket content','MEDIUM','RESOLVED','WEB')
     RETURNING id`,
    [target.id, category.rows[0].id],
  );
  ticketIds.push(ticket.rows[0].id);
  const comment = await pool.query<{ id: string }>(
    `INSERT INTO comments(ticket_id,author_id,body) VALUES($1,$2,'Historical comment') RETURNING id`,
    [ticket.rows[0].id, target.id],
  );

  assert.equal((await remove(target.id, admin.cookie)).status, 204);
  const preserved = await pool.query(
    `SELECT tickets.status::text AS status, tickets.reporter_id, comments.body
     FROM tickets JOIN comments ON comments.ticket_id = tickets.id
     WHERE tickets.id=$1 AND comments.id=$2`,
    [ticket.rows[0].id, comment.rows[0].id],
  );
  assert.equal(preserved.rowCount, 1);
  assert.equal(preserved.rows[0].status, "RESOLVED");
  assert.equal(preserved.rows[0].reporter_id, target.id);
  assert.equal(preserved.rows[0].body, "Historical comment");
});
