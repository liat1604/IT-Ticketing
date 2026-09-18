import { hash } from "bcryptjs";
import { pool } from "./db.js";

const email = process.env.DEV_USER_EMAIL;
const password = process.env.DEV_USER_PASSWORD;
const technicianEmail = process.env.DEV_TECHNICIAN_EMAIL;
const technicianPassword = process.env.DEV_TECHNICIAN_PASSWORD;

if (process.env.NODE_ENV === "production") {
  throw new Error("The development user cannot be seeded in production");
}

if (!email || !password || !technicianEmail || !technicianPassword) {
  throw new Error("Development administrator and technician credentials are required");
}

if (password.length < 12 || technicianPassword.length < 12) {
  throw new Error("Development passwords must contain at least 12 characters");
}

const passwordHash = await hash(password, 12);
const technicianPasswordHash = await hash(technicianPassword, 12);

await pool.query(
  `INSERT INTO users (email, full_name, password_hash, role, is_active)
   VALUES ($1, 'Development Administrator', $2, 'ADMIN', TRUE)
   ON CONFLICT (LOWER(email)) DO UPDATE
   SET full_name = EXCLUDED.full_name,
       password_hash = EXCLUDED.password_hash,
       role = EXCLUDED.role,
       is_active = TRUE,
       updated_at = CURRENT_TIMESTAMP`,
  [email.toLowerCase(), passwordHash],
);

console.log(`Development account ready: ${email.toLowerCase()}`);

await pool.query(
  `INSERT INTO users (email, full_name, password_hash, role, is_active)
   VALUES ($1, 'Pieter Jacobs', $2, 'TECHNICIAN', TRUE)
   ON CONFLICT (LOWER(email)) DO UPDATE
   SET full_name = EXCLUDED.full_name,
       password_hash = EXCLUDED.password_hash,
       role = EXCLUDED.role,
       is_active = TRUE,
       updated_at = CURRENT_TIMESTAMP`,
  [technicianEmail.toLowerCase(), technicianPasswordHash],
);

console.log(`Development technician ready: ${technicianEmail.toLowerCase()}`);
await pool.end();
