import { createHash, randomBytes } from "node:crypto";
import { compare, hash } from "bcryptjs";
import { Router, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import type { PoolClient } from "pg";
import { z } from "zod";
import { pool } from "../db.js";
import { queueEmailVerification } from "../services/email-verification.js";

export const authRouter = Router();

const sessionCookieName = "csis_session";
const sessionDurationMilliseconds = 7 * 24 * 60 * 60 * 1000;
const passwordResetDurationMilliseconds = 15 * 60 * 1000;
const passwordResetConfirmation =
  "If an account exists for that email address, a password-reset link has been sent.";

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many authentication attempts. Please try again later.",
  },
});

export const passwordResetRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many password-reset requests. Please try again later." },
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

const registerSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    email: nwuEmailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

const loginSchema = z.object({
  email: nwuEmailSchema,
  password: z.string().min(1).max(128),
});

const forgotPasswordSchema = z.object({ email: nwuEmailSchema });
const resetPasswordSchema = z
  .object({
    token: z.string().min(32).max(256),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function hashResetToken(token: string) {
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
    await queueEmailVerification(client, user);

    await client.query(
      `INSERT INTO audit_events (actor_id, action, new_values)
       VALUES ($1, 'USER_REGISTERED', $2::jsonb)`,
      [user.id, JSON.stringify({ email: user.email, role: user.role })],
    );

    await client.query("COMMIT");

    response.status(201).json({
      message: "Check your email for a verification link before signing in or creating tickets. The link expires in 24 hours.",
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
      email_verified_at: Date | null;
    }>(
      `SELECT id, email, full_name, password_hash, role, is_active, email_verified_at
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

    if (!user.email_verified_at) {
      response.status(403).json({ error: "Verify your email before signing in. Use Resend verification email if you need another link." });
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

const verificationRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false,
  message: { error: "Too many verification requests. Please try again later." },
});

 authRouter.post("/resend-verification", verificationRateLimiter, async (request, response) => {
  const parsed = forgotPasswordSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Use a valid @mynwu.ac.za email address" });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<{ id: string; email: string }>(
      `SELECT id, email FROM users WHERE LOWER(email) = LOWER($1)
       AND is_active = TRUE AND email_verified_at IS NULL FOR UPDATE`, [parsed.data.email],
    );
    if (result.rows[0]) await queueEmailVerification(client, result.rows[0]);
    await client.query("COMMIT");
    response.json({ message: "If this account needs verification, a verification email has been queued. Check your inbox and spam folder." });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Verification request failed", error);
    response.status(500).json({ error: "Unable to request a verification email. Please try again." });
  } finally { client.release(); }
});

authRouter.post("/verify-email", rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { error: "Too many verification attempts. Please try again later." } }), async (request, response) => {
  const parsed = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "This verification link is invalid. Request another verification email." });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Lock the account so concurrent links cannot verify the same account twice.
    const result = await client.query<{ id: string; user_id: string }>(
      `SELECT t.id, t.user_id FROM email_verification_tokens t
       JOIN users u ON u.id = t.user_id
       WHERE t.token_hash = $1 AND t.used_at IS NULL AND t.expires_at > CURRENT_TIMESTAMP
         AND u.is_active = TRUE AND u.email_verified_at IS NULL
       FOR UPDATE OF u`, [hashResetToken(parsed.data.token)],
    );
    const verification = result.rows[0];
    if (!verification) {
      await client.query("ROLLBACK");
      response.status(400).json({ error: "This verification link is invalid, expired, or already used. Sign in if already verified, or request another email." });
      return;
    }
    await client.query(`UPDATE users SET email_verified_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [verification.user_id]);
    await client.query(`UPDATE email_verification_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND used_at IS NULL`, [verification.user_id]);
    await client.query(`INSERT INTO audit_events (actor_id, action) VALUES ($1, 'EMAIL_VERIFIED')`, [verification.user_id]);
    await client.query("COMMIT");
    response.json({ message: "Your email is verified. You can now sign in and create tickets." });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Email verification failed", error);
    response.status(500).json({ error: "Unable to verify your email. Please try again." });
  } finally { client.release(); }
});
authRouter.post("/forgot-password", passwordResetRateLimiter, async (request, response) => {
  const parsed = forgotPasswordSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ error: "Use a valid @mynwu.ac.za email address" });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<{ id: string; email: string }>(
      `SELECT id, email FROM users
       WHERE LOWER(email) = LOWER($1) AND is_active = TRUE`,
      [parsed.data.email],
    );
    const user = result.rows[0];

    if (user) {
      const token = randomBytes(32).toString("base64url");
      const expiresAt = new Date(Date.now() + passwordResetDurationMilliseconds);
      const baseUrl = (process.env.APP_BASE_URL ?? "http://localhost:5173").replace(/\/$/, "");
      const resetUrl = `${baseUrl}/?resetToken=${encodeURIComponent(token)}`;

      await client.query(
        `UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND used_at IS NULL`,
        [user.id],
      );
      await client.query(
        `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [user.id, hashResetToken(token), expiresAt],
      );
      await client.query(
        `INSERT INTO notification_outbox (recipient_email, event_type, payload)
         VALUES ($1, 'PASSWORD_RESET_REQUESTED', $2::jsonb)`,
        [user.email, JSON.stringify({ resetUrl, expiresInMinutes: 15 })],
      );
      await client.query(
        `INSERT INTO audit_events (actor_id, action, new_values)
         VALUES ($1, 'PASSWORD_RESET_REQUESTED', $2::jsonb)`,
        [user.id, JSON.stringify({ deliveryQueued: true })],
      );
    } else {
      await client.query(
        `INSERT INTO audit_events (action, new_values)
         VALUES ('PASSWORD_RESET_REQUESTED', $1::jsonb)`,
        [JSON.stringify({ deliveryQueued: false })],
      );
    }

    await client.query("COMMIT");
    response.json({ message: passwordResetConfirmation });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Password-reset request failed", error);
    response.status(500).json({ error: "The password-reset request could not be completed" });
  } finally {
    client.release();
  }
});

authRouter.post("/reset-password", authRateLimiter, async (request, response) => {
  const parsed = resetPasswordSchema.safeParse(request.body);
  if (!parsed.success) {
    const mismatch = parsed.error.issues.find((issue) => issue.path[0] === "confirmPassword");
    response.status(400).json({
      error: mismatch?.message ?? "Use a password with at least 12 characters, uppercase, lowercase, and a number",
    });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<{ id: string; user_id: string }>(
      `SELECT id, user_id FROM password_reset_tokens
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP
       FOR UPDATE`,
      [hashResetToken(parsed.data.token)],
    );
    const reset = result.rows[0];
    if (!reset) {
      await client.query("ROLLBACK");
      response.status(400).json({ error: "This password-reset link is invalid, expired, or has already been used." });
      return;
    }

    const passwordHash = await hash(parsed.data.password, 12);
    await client.query(
      `UPDATE users SET password_hash = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [reset.user_id, passwordHash],
    );
    await client.query(
      `UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [reset.id],
    );
    await client.query(
      `UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [reset.user_id],
    );
    await client.query(
      `INSERT INTO audit_events (actor_id, action, new_values)
       VALUES ($1, 'PASSWORD_RESET_COMPLETED', $2::jsonb)`,
      [reset.user_id, JSON.stringify({ sessionsRevoked: true })],
    );
    await client.query("COMMIT");
    response.json({ message: "Your password has been reset. You can now sign in." });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Password reset failed", error);
    response.status(500).json({ error: "The password could not be reset" });
  } finally {
    client.release();
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
       AND users.is_active = TRUE
       AND users.email_verified_at IS NOT NULL`,
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
