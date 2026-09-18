import { hash } from "bcryptjs";
import { pool } from "./db.js";

const email = process.env.DEV_USER_EMAIL;
const password = process.env.DEV_USER_PASSWORD;

if (process.env.NODE_ENV === "production") {
  throw new Error("The development user cannot be seeded in production");
}

if (!email || !password) {
  throw new Error("DEV_USER_EMAIL and DEV_USER_PASSWORD are required");
}

if (password.length < 12) {
  throw new Error("DEV_USER_PASSWORD must contain at least 12 characters");
}

const passwordHash = await hash(password, 12);

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
await pool.end();
