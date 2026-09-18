import { createHash, randomBytes } from "node:crypto";
import { compare, hash } from "bcryptjs";
import { Router, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import type { PoolClient } from "pg";
import { z } from "zod";
import { pool } from "../db.js";

export const authRouter = Router();

const sessionCookieName = "csis_session";
const sessionDurationMilliseconds = 7 * 24 * 60 * 60 * 1000;

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many authentication attempts. Please try again later.",
  },
});

const passwordSchema = z
  .string()
  .min(12, "Password must contain at least 12 characters")
  .max(128)
  .regex(/[a-z]/, "Password must contain a lowercase letter")
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/[0-9]/, "Password must contain a number");

const nwuEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .refine(
    (email) => email.endsWith("@mynwu.ac.za"),
    "Use a valid @mynwu.ac.za email address",
  );

const registerSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: nwuEmailSchema,
  password: passwordSchema,
});

const loginSchema = z.object({
  email: nwuEmailSchema,
  password: z.string().min(1).max(128),
});

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function setSessionCookie(response: Response, token: string) {
  response.cookie(sessionCookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: sessionDurationMilliseconds,
  });
}

async function createSession(client: PoolClient, userId: string) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + sessionDurationMilliseconds);

  await client.query(
    `INSERT INTO sessions (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt],
  );

  return token;
}

authRouter.post("/register", authRateLimiter, async (request, response) => {
  const parsed = registerSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({
      error: "Invalid registration information",
      details: parsed.error.issues,
    });
    return;
  }

  const { fullName, email, password } = parsed.data;
  const passwordHash = await hash(password, 12);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query<{
      id: string;
      email: string;
      full_name: string;
      role: string;
    }>(
      `INSERT INTO users (email, full_name, password_hash, role)
       VALUES ($1, $2, $3, 'REPORTER')
       RETURNING id, email, full_name, role`,
      [email, fullName, passwordHash],
    );

    const user = result.rows[0];
    const sessionToken = await createSession(client, user.id);

    await client.query(
      `INSERT INTO audit_events (actor_id, action, new_values)
       VALUES ($1, 'USER_REGISTERED', $2::jsonb)`,
      [user.id, JSON.stringify({ email: user.email, role: user.role })],
    );

    await client.query("COMMIT");

    setSessionCookie(response, sessionToken);

    response.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");

    if ((error as { code?: string }).code === "23505") {
      response.status(409).json({
        error: "An account with this email address already exists",
      });
      return;
    }

    console.error("Registration failed", error);
    response.status(500).json({ error: "Registration failed" });
  } finally {
    client.release();
  }
});

authRouter.post("/login", authRateLimiter, async (request, response) => {
  const parsed = loginSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ error: "Invalid login information" });
    return;
  }

  const { email, password } = parsed.data;

  try {
    const result = await pool.query<{
      id: string;
      email: string;
      full_name: string;
      password_hash: string;
      role: string;
      is_active: boolean;
    }>(
      `SELECT id, email, full_name, password_hash, role, is_active
       FROM users
       WHERE LOWER(email) = LOWER($1)`,
      [email],
    );

    const user = result.rows[0];

    if (
      !user ||
      !user.is_active ||
      !(await compare(password, user.password_hash))
    ) {
      response.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      const sessionToken = await createSession(client, user.id);

      await client.query(
        `INSERT INTO audit_events (actor_id, action)
         VALUES ($1, 'LOGIN_SUCCESS')`,
        [user.id],
      );

      await client.query("COMMIT");
      setSessionCookie(response, sessionToken);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    response.json({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login failed", error);
    response.status(500).json({ error: "Login failed" });
  }
});

authRouter.post("/logout", async (request, response) => {
  const token = request.cookies?.[sessionCookieName] as string | undefined;

  if (token) {
    await pool.query(
      `UPDATE sessions
       SET revoked_at = CURRENT_TIMESTAMP
       WHERE token_hash = $1 AND revoked_at IS NULL`,
      [hashSessionToken(token)],
    );
  }

  response.clearCookie(sessionCookieName, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });

  response.status(204).send();
});

authRouter.get("/me", async (request, response) => {
  const token = request.cookies?.[sessionCookieName] as string | undefined;

  if (!token) {
    response.status(401).json({ error: "Authentication required" });
    return;
  }

  const result = await pool.query<{
    id: string;
    email: string;
    full_name: string;
    role: string;
  }>(
    `SELECT users.id, users.email, users.full_name, users.role
     FROM sessions
     JOIN users ON users.id = sessions.user_id
     WHERE sessions.token_hash = $1
       AND sessions.revoked_at IS NULL
       AND sessions.expires_at > CURRENT_TIMESTAMP
       AND users.is_active = TRUE`,
    [hashSessionToken(token)],
  );

  const user = result.rows[0];

  if (!user) {
    response.status(401).json({ error: "Session expired or invalid" });
    return;
  }

  response.json({
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
    },
  });
});
