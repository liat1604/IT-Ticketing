import { createHash, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { hash } from "bcryptjs";
import cookieParser from "cookie-parser";
import express from "express";
import type { Server } from "node:http";

import { pool } from "../db.js";
import { ticketsRouter } from "../routes/tickets.js";
import { authRouter } from "../routes/auth.js";

let server: Server;
let baseUrl = "";
const createdUserIds: string[] = [];
const createdEmails: string[] = [];

before(async () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/auth", authRouter);
  app.use("/api/tickets", ticketsRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Test server did not start");
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

after(async () => {
  if (createdUserIds.length) {
    await pool.query(`DELETE FROM notification_outbox WHERE recipient_email = ANY($1::text[])`, [createdEmails]);
    await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [createdUserIds]);
  }
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await pool.end();
});

async function post(path: string, body: Record<string, unknown>) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function createTestUser() {
  const email = `reset-${randomUUID()}@mynwu.ac.za`;
  const result = await pool.query<{ id: string }>(
    `INSERT INTO users (email, full_name, password_hash, role)
     VALUES ($1, 'Password Reset Test', $2, 'REPORTER') RETURNING id`,
    [email, await hash("OriginalPass2026!", 4)],
  );
  createdUserIds.push(result.rows[0].id);
  createdEmails.push(email);
  return { id: result.rows[0].id, email };
}

test("registration rejects mismatched passwords", async () => {
  const response = await post("/api/auth/register", { fullName: "Mismatch Test", email: `mismatch-${randomUUID()}@mynwu.ac.za`, password: "StrongPassword2026", confirmPassword: "DifferentPassword2026" });
  assert.equal(response.status, 400);
});

test("registration rejects an invalid NWU email", async () => {
  const response = await post("/api/auth/register", { fullName: "Invalid Email", email: `invalid-${randomUUID()}@example.com`, password: "StrongPassword2026", confirmPassword: "StrongPassword2026" });
  assert.equal(response.status, 400);
});

test("registration accepts matching strong passwords and a valid NWU email", async () => {
  const email = `register-${randomUUID()}@mynwu.ac.za`;
  const response = await post("/api/auth/register", { fullName: "Valid Registration", email, password: "StrongPassword2026", confirmPassword: "StrongPassword2026" });
  assert.equal(response.status, 201);
  const user = await pool.query<{ id: string }>(`SELECT id FROM users WHERE email = $1`, [email]);
  createdUserIds.push(user.rows[0].id);
  createdEmails.push(email);
});

test("expired reset tokens are rejected", async () => {
  const user = await createTestUser();
  const token = randomUUID() + randomUUID();
  await pool.query(`INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, CURRENT_TIMESTAMP - INTERVAL '1 minute')`, [user.id, createHash("sha256").update(token).digest("hex")]);
  const response = await post("/api/auth/reset-password", { token, password: "ReplacementPass2026!", confirmPassword: "ReplacementPass2026!" });
  assert.equal(response.status, 400);
});

test("a reset token succeeds once and cannot be reused", async () => {
  const user = await createTestUser();
  const token = randomUUID() + randomUUID();
  await pool.query(`INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '15 minutes')`, [user.id, createHash("sha256").update(token).digest("hex")]);
  const first = await post("/api/auth/reset-password", { token, password: "ReplacementPass2026!", confirmPassword: "ReplacementPass2026!" });
  const second = await post("/api/auth/reset-password", { token, password: "AnotherStrongPass2026!", confirmPassword: "AnotherStrongPass2026!" });
  assert.equal(first.status, 200);
  assert.equal(second.status, 400);
  const audit = await pool.query(`SELECT 1 FROM audit_events WHERE actor_id = $1 AND action = 'PASSWORD_RESET_COMPLETED'`, [user.id]);
  assert.equal(audit.rowCount, 1);
});

test("forgot-password responses do not disclose account existence and are rate limited", async () => {
  const user = await createTestUser();
  const existing = await post("/api/auth/forgot-password", { email: user.email });
  const missing = await post("/api/auth/forgot-password", { email: `missing-${randomUUID()}@mynwu.ac.za` });
  assert.equal(existing.status, 200);
  assert.equal(missing.status, 200);
  assert.equal((await existing.json() as { message: string }).message, (await missing.json() as { message: string }).message);

  const attempts = await Promise.all(Array.from({ length: 5 }, () => post("/api/auth/forgot-password", { email: `limited-${randomUUID()}@mynwu.ac.za` })));
  assert.ok(attempts.some((response) => response.status === 429));
});


test("expired verification links fail and resend queues a fresh link without disclosing accounts", async () => {
  const user = await createTestUser();
  const token = "a".repeat(43);
  await pool.query(`INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, CURRENT_TIMESTAMP - INTERVAL '1 minute')`, [user.id, createHash("sha256").update(token).digest("hex")]);
  assert.equal((await post("/api/auth/verify-email", { token })).status, 400);
  const existing = await post("/api/auth/resend-verification", { email: user.email });
  const missing = await post("/api/auth/resend-verification", { email: `missing-${randomUUID()}@mynwu.ac.za` });
  assert.equal(existing.status, 200);
  assert.deepEqual(await existing.json(), await missing.json());
  const queued = await pool.query(`SELECT payload FROM notification_outbox WHERE recipient_email = $1 AND event_type = 'EMAIL_VERIFICATION_REQUESTED'`, [user.email]);
  const freshToken = new URL(queued.rows[0].payload.verificationUrl).searchParams.get("verifyToken");
  assert.equal((await post("/api/auth/verify-email", { token: freshToken })).status, 200);
  const attempts = await Promise.all(Array.from({ length: 4 }, () => post("/api/auth/resend-verification", { email: user.email })));
  assert.ok(attempts.some((response) => response.status === 429));
});

test("signup requires verification for login, existing sessions and ticket creation", async () => {
  const email = `verify-${randomUUID()}@mynwu.ac.za`;
  const password = "StrongPassword2026";
  const response = await post("/api/auth/register", { fullName: "Verification Test", email, password, confirmPassword: password });
  assert.equal(response.status, 201);
  const user = await pool.query<{ id: string }>(`SELECT id FROM users WHERE email = $1`, [email]);
  createdUserIds.push(user.rows[0].id);
  createdEmails.push(email);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal((await post("/api/auth/login", { email, password })).status, 403);
  const sessionToken = randomUUID();
  await pool.query(`INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '1 hour')`, [user.rows[0].id, createHash("sha256").update(sessionToken).digest("hex")]);
  const headers = { cookie: `csis_session=${sessionToken}`, "content-type": "application/json" };
  assert.equal((await fetch(`${baseUrl}/api/auth/me`, { headers })).status, 401);
  assert.equal((await fetch(`${baseUrl}/api/tickets`, { method: "POST", headers, body: "{}" })).status, 401);
  const queued = await pool.query(`SELECT payload FROM notification_outbox WHERE recipient_email = $1 AND event_type = 'EMAIL_VERIFICATION_REQUESTED'`, [email]);
  const token = new URL(queued.rows[0].payload.verificationUrl).searchParams.get("verifyToken");
  assert.equal((await post("/api/auth/verify-email", { token })).status, 200);
  assert.equal((await post("/api/auth/verify-email", { token })).status, 400);
  const login = await post("/api/auth/login", { email, password });
  assert.equal(login.status, 200);
  assert.ok(login.headers.get("set-cookie"));
});
