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
const auditIds: string[] = [];

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
  await pool.query(`DELETE FROM audit_events WHERE actor_id = ANY($1::uuid[]) OR id = ANY($2::bigint[])`, [userIds, auditIds]);
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
  userIds.push(id); emails.push(email);
  const token = randomUUID();
  await pool.query(`INSERT INTO sessions(user_id, token_hash, expires_at) VALUES($1,$2,CURRENT_TIMESTAMP + INTERVAL '1 hour')`, [id, createHash("sha256").update(token).digest("hex")]);
  return { id, email, cookie: `csis_session=${token}` };
}
function remove(id: string, cookie?: string) {
  return fetch(`${baseUrl}/api/admin/users/${id}`, { method: "DELETE", headers: cookie ? { cookie } : {} });
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

test("deleting an unused account removes access and tokens while preserving audit history", async () => {
  const admin = await account("ADMIN");
  const target = await account();
  const audit = await pool.query<{ id: string }>(`INSERT INTO audit_events(actor_id, action) VALUES($1,'LOGIN_SUCCESS') RETURNING id`, [target.id]);
  auditIds.push(audit.rows[0].id);
  for (const table of ["email_verification_tokens", "password_reset_tokens"]) {
    await pool.query(`INSERT INTO ${table}(user_id, token_hash, expires_at) VALUES($1,$2,CURRENT_TIMESTAMP + INTERVAL '1 hour')`, [target.id, randomUUID()]);
  }
  await pool.query(`INSERT INTO notification_outbox(recipient_email,event_type,payload) VALUES($1,'EMAIL_VERIFICATION_REQUESTED','{}')`, [target.email]);
  assert.equal((await remove(target.id, admin.cookie)).status, 204);
  for (const table of ["sessions", "email_verification_tokens", "password_reset_tokens"]) {
    assert.equal((await pool.query(`SELECT 1 FROM ${table} WHERE user_id=$1`, [target.id])).rowCount, 0);
  }
  assert.equal((await pool.query(`SELECT 1 FROM users WHERE id=$1`, [target.id])).rowCount, 0);
  assert.equal((await pool.query(`SELECT 1 FROM notification_outbox WHERE recipient_email=$1`, [target.email])).rowCount, 0);
  assert.equal((await fetch(`${baseUrl}/api/auth/me`, { headers: { cookie: target.cookie } })).status, 401);
  const preserved = await pool.query(`SELECT actor_id, previous_values FROM audit_events WHERE id=$1`, [audit.rows[0].id]);
  assert.equal(preserved.rows[0].actor_id, null);
  assert.equal(preserved.rows[0].previous_values.deletedActor.id, target.id);
  const deletion = await pool.query(`SELECT 1 FROM audit_events WHERE actor_id=$1 AND action='USER_DELETED_BY_ADMIN' AND previous_values->>'userId'=$2`, [admin.id, target.id]);
  assert.equal(deletion.rowCount, 1);
  assert.equal((await remove(target.id, admin.cookie)).status, 404);
});

test("linked tickets block deletion and roll back all changes", async () => {
  const admin = await account("ADMIN");
  const target = await account();
  const audit = await pool.query<{ id: string }>(`INSERT INTO audit_events(actor_id, action) VALUES($1,'LOGIN_SUCCESS') RETURNING id`, [target.id]);
  auditIds.push(audit.rows[0].id);
  const category = await pool.query(`SELECT id FROM categories ORDER BY id LIMIT 1`);
  const ticket = await pool.query<{ id: string }>(`INSERT INTO tickets(reporter_id,created_by,category_id,title,description,priority,status,source) VALUES($1,$1,$2,'Deletion test','Preserve this ticket','MEDIUM','NEW','WEB') RETURNING id`, [target.id, category.rows[0].id]);
  ticketIds.push(ticket.rows[0].id);
  const response = await remove(target.id, admin.cookie);
  assert.equal(response.status, 409);
  assert.match((await response.json() as { error: string }).error, /Deactivate/);
  assert.equal((await pool.query(`SELECT 1 FROM users WHERE id=$1`, [target.id])).rowCount, 1);
  assert.equal((await pool.query(`SELECT actor_id FROM audit_events WHERE id=$1`, [audit.rows[0].id])).rows[0].actor_id, target.id);
  assert.equal((await fetch(`${baseUrl}/api/auth/me`, { headers: { cookie: target.cookie } })).status, 200);
});
