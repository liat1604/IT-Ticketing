import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";
import { pool } from "../db.js";

test("ticket assignment creates one linked job card and follows reassignment", async () => {
  const client = await pool.connect();
  await client.query("BEGIN");
  try {
    const suffix = randomUUID();
    const reporter = await client.query<{ id: string }>(
      `INSERT INTO users (email, full_name, password_hash, role)
       VALUES ($1, 'Job Card Test Reporter', 'test', 'REPORTER')
       RETURNING id`,
      [`reporter-${suffix}@mynwu.ac.za`],
    );
    const firstTechnician = await client.query<{ id: string }>(
      `INSERT INTO users (email, full_name, password_hash, role)
       VALUES ($1, 'Job Card Test Technician One', 'test', 'TECHNICIAN')
       RETURNING id`,
      [`technician-one-${suffix}@mynwu.ac.za`],
    );
    const secondTechnician = await client.query<{ id: string }>(
      `INSERT INTO users (email, full_name, password_hash, role)
       VALUES ($1, 'Job Card Test Technician Two', 'test', 'TECHNICIAN')
       RETURNING id`,
      [`technician-two-${suffix}@mynwu.ac.za`],
    );
    const category = await client.query<{ id: number }>(
      "SELECT id FROM categories ORDER BY id LIMIT 1",
    );
    const ticket = await client.query<{ id: string }>(
      `INSERT INTO tickets (
         reporter_id, created_by, assigned_to, category_id, department, title,
         description, priority, status, source
       )
       VALUES ($1, $1, $2, $3, 'Mathematics', 'Assigned job-card test',
               'Verifies automatic creation from ticket assignments.',
               'MEDIUM', 'ASSIGNED', 'WEB')
       RETURNING id`,
      [reporter.rows[0].id, firstTechnician.rows[0].id, category.rows[0].id],
    );

    const created = await client.query<{
      assigned_to: string;
      status: string;
      title: string;
      department: string | null;
    }>(
      `SELECT assigned_to, status::TEXT, title, department
       FROM job_cards WHERE primary_ticket_id = $1`,
      [ticket.rows[0].id],
    );
    assert.equal(created.rows.length, 1);
    assert.equal(created.rows[0].assigned_to, firstTechnician.rows[0].id);
    assert.equal(created.rows[0].status, "SCHEDULED");
    assert.equal(created.rows[0].title, "Assigned job-card test");
    assert.equal(created.rows[0].department, "Mathematics");

    await client.query("UPDATE tickets SET assigned_to = $2 WHERE id = $1", [
      ticket.rows[0].id,
      secondTechnician.rows[0].id,
    ]);
    const reassigned = await client.query<{
      assigned_to: string;
      count: number;
    }>(
      `SELECT assigned_to, COUNT(*) OVER ()::INTEGER AS count
       FROM job_cards WHERE primary_ticket_id = $1`,
      [ticket.rows[0].id],
    );
    assert.equal(reassigned.rows.length, 1);
    assert.equal(reassigned.rows[0].count, 1);
    assert.equal(reassigned.rows[0].assigned_to, secondTechnician.rows[0].id);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});

test.after(async () => {
  await pool.end();
});
