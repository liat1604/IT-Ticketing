import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { pool } from "../db.js";
import { pauseJobCardTimer, startOrSwitchJobTimer } from "../services/job-timers.js";

test("multiple job timers can run together and a stale live card can be paused", async () => {
  const client = await pool.connect();
  await client.query("BEGIN");
  try {
    const suffix = randomUUID();
    const reporter = await client.query<{ id: string }>(
      `INSERT INTO users (email, full_name, password_hash, role, email_verified_at)
       VALUES ($1, 'Job Timer Test Reporter', 'test', 'REPORTER', CURRENT_TIMESTAMP)
       RETURNING id`,
      [`timer-reporter-${suffix}@mynwu.ac.za`],
    );
    const technician = await client.query<{ id: string }>(
      `INSERT INTO users (email, full_name, password_hash, role, email_verified_at)
       VALUES ($1, 'Job Timer Test Technician', 'test', 'TECHNICIAN', CURRENT_TIMESTAMP)
       RETURNING id`,
      [`timer-technician-${suffix}@mynwu.ac.za`],
    );
    const category = await client.query<{ id: number }>(
      "SELECT id FROM categories ORDER BY id LIMIT 1",
    );

    async function createTicket(title: string) {
      const result = await client.query<{ id: string }>(
        `INSERT INTO tickets (
           reporter_id, created_by, category_id, title, description,
           priority, status, source
         )
         VALUES ($1, $2, $3, $4, 'Job timer integration test ticket.',
                 'MEDIUM', 'ASSIGNED', 'WEB')
         RETURNING id`,
        [reporter.rows[0].id, technician.rows[0].id, category.rows[0].id, title],
      );
      return result.rows[0].id;
    }

    async function createCard(ticketId: string, status: string, title: string) {
      const result = await client.query<{ id: string }>(
        `INSERT INTO job_cards (
           primary_ticket_id, assigned_to, created_by, title, description,
           category_id, priority, status
         )
         VALUES ($1, $2, $2, $3, 'Job timer integration test card.', $4,
                 'MEDIUM', $5::job_card_status)
         RETURNING id`,
        [ticketId, technician.rows[0].id, title, category.rows[0].id, status],
      );
      return result.rows[0].id;
    }

    const firstTicketId = await createTicket("First timer test ticket");
    const secondTicketId = await createTicket("Second timer test ticket");
    const staleTicketId = await createTicket("Stale timer test ticket");
    const firstCardId = await createCard(firstTicketId, "LIVE", "First timer card");
    const secondCardId = await createCard(secondTicketId, "SCHEDULED", "Second timer card");
    const staleCardId = await createCard(staleTicketId, "LIVE", "Stale timer card");
    await client.query(
      `INSERT INTO time_entries (ticket_id, technician_id, job_card_id, started_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP - INTERVAL '1 minute')`,
      [firstTicketId, technician.rows[0].id, firstCardId],
    );

    const started = await startOrSwitchJobTimer(client, {
      ticketId: secondTicketId,
      technicianId: technician.rows[0].id,
      jobCardId: secondCardId,
    });
    assert.equal(started.alreadyRunning, false);

    const resumed = await startOrSwitchJobTimer(client, {
      ticketId: secondTicketId,
      technicianId: technician.rows[0].id,
      jobCardId: secondCardId,
    });
    assert.equal(resumed.alreadyRunning, true);

    const cards = await client.query<{ id: string; status: string }>(
      "SELECT id, status::text FROM job_cards WHERE id = ANY($1::uuid[])",
      [[firstCardId, secondCardId]],
    );
    assert.equal(cards.rows.find((card) => card.id === firstCardId)?.status, "LIVE");
    assert.equal(cards.rows.find((card) => card.id === secondCardId)?.status, "LIVE");

    const timers = await client.query<{ job_card_id: string; stopped_at: Date | null }>(
      `SELECT job_card_id, stopped_at FROM time_entries
       WHERE ticket_id = ANY($1::uuid[]) ORDER BY started_at`,
      [[firstTicketId, secondTicketId]],
    );
    assert.equal(timers.rows.length, 2);
    assert.equal(timers.rows[0].stopped_at, null);
    assert.equal(timers.rows[1].job_card_id, secondCardId);
    assert.equal(timers.rows[1].stopped_at, null);

    const stoppedCount = await pauseJobCardTimer(client, {
      jobCardId: firstCardId,
      ticketId: firstTicketId,
      technicianId: technician.rows[0].id,
    });
    assert.equal(stoppedCount, 1);
    const afterPause = await client.query<{ job_card_id: string; stopped_at: Date | null }>(
      `SELECT job_card_id, stopped_at FROM time_entries
       WHERE ticket_id = ANY($1::uuid[]) ORDER BY started_at`,
      [[firstTicketId, secondTicketId]],
    );
    assert.ok(afterPause.rows[0].stopped_at);
    assert.equal(afterPause.rows[1].stopped_at, null);
    const secondCardAfterPause = await client.query<{ status: string }>(
      "SELECT status::text FROM job_cards WHERE id = $1",
      [secondCardId],
    );
    assert.equal(secondCardAfterPause.rows[0].status, "LIVE");
    const firstCardAfterPause = await client.query<{ status: string }>(
      "SELECT status::text FROM job_cards WHERE id = $1",
      [firstCardId],
    );
    assert.equal(firstCardAfterPause.rows[0].status, "PAUSED");

    const staleStoppedCount = await pauseJobCardTimer(client, {
      jobCardId: staleCardId,
      ticketId: staleTicketId,
      technicianId: technician.rows[0].id,
    });
    assert.equal(staleStoppedCount, 0);
    const staleCard = await client.query<{ status: string }>(
      "SELECT status::text FROM job_cards WHERE id = $1",
      [staleCardId],
    );
    assert.equal(staleCard.rows[0].status, "PAUSED");
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});

test.after(async () => {
  await pool.end();
});
