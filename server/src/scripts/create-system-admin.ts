import "dotenv/config";
import { hash } from "bcryptjs";
import { z } from "zod";

import { pool } from "../db.js";

const inputSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().refine(
    (email) => email.endsWith("@mynwu.ac.za"),
    "ADMIN_EMAIL must be an NWU email address",
  ),
  password: z.string().min(12).max(128).regex(/[a-z]/).regex(/[A-Z]/).regex(/[0-9]/),
});

async function main() {
  const parsed = inputSchema.safeParse({
    fullName: process.env.ADMIN_FULL_NAME,
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid administrator details");
  }

  const passwordHash = await hash(parsed.data.password, 12);
  const result = await pool.query<{ id: string; email: string }>(
    `INSERT INTO users (full_name, email, password_hash, role, is_active)
     VALUES ($1, $2, $3, 'SYSTEM_ADMIN', TRUE)
     ON CONFLICT (email) DO UPDATE
       SET full_name = EXCLUDED.full_name,
           password_hash = EXCLUDED.password_hash,
           role = 'SYSTEM_ADMIN',
           is_active = TRUE,
           updated_at = CURRENT_TIMESTAMP
     RETURNING id, email`,
    [parsed.data.fullName, parsed.data.email, passwordHash],
  );

  await pool.query(
    `INSERT INTO audit_events (action, new_values)
     VALUES ('SYSTEM_ADMIN_BOOTSTRAPPED', $1::jsonb)`,
    [JSON.stringify({ userId: result.rows[0].id, email: result.rows[0].email })],
  );

  console.log(`System administrator ready: ${result.rows[0].email}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
