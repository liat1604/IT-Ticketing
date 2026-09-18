import assert from "node:assert/strict";
import { test } from "node:test";

import { pool } from "../db.js";

test("audit events allow inserts but reject updates, deletes and truncates", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO audit_events (action, new_values)
       VALUES ('AUDIT_IMMUTABILITY_TEST', '{"state":"original"}'::jsonb)
       RETURNING id`,
    );
    const id = inserted.rows[0].id;

    await client.query("SAVEPOINT audit_update_attempt");
    await assert.rejects(
      client.query(
        `UPDATE audit_events
         SET new_values = '{"state":"changed"}'::jsonb
         WHERE id = $1`,
        [id],
      ),
      (error: unknown) =>
        (error as { code?: string }).code === "42501" &&
        String((error as { message?: string }).message).includes("immutable"),
    );
    await client.query("ROLLBACK TO SAVEPOINT audit_update_attempt");

    await client.query("SAVEPOINT audit_delete_attempt");
    await assert.rejects(
      client.query(`DELETE FROM audit_events WHERE id = $1`, [id]),
      (error: unknown) =>
        (error as { code?: string }).code === "42501" &&
        String((error as { message?: string }).message).includes("immutable"),
    );
    await client.query("ROLLBACK TO SAVEPOINT audit_delete_attempt");

    await client.query("SAVEPOINT audit_truncate_attempt");
    await assert.rejects(
      client.query("TRUNCATE audit_events"),
      (error: unknown) =>
        (error as { code?: string }).code === "42501" &&
        String((error as { message?: string }).message).includes("immutable"),
    );
    await client.query("ROLLBACK TO SAVEPOINT audit_truncate_attempt");

    const preserved = await client.query<{ new_values: { state: string } }>(
      `SELECT new_values FROM audit_events WHERE id = $1`,
      [id],
    );
    assert.deepEqual(preserved.rows[0].new_values, { state: "original" });
    await client.query("ROLLBACK");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});
