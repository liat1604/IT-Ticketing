import { createHash, randomBytes } from "node:crypto";
import type { PoolClient } from "pg";

export async function queueEmailVerification(client: PoolClient, user: { id: string; email: string }) {
  const token = randomBytes(32).toString("base64url");
  const baseUrl = (process.env.APP_BASE_URL ?? "http://localhost:5173").replace(/\/$/, "");
  await client.query(
    `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [user.id, createHash("sha256").update(token).digest("hex"), new Date(Date.now() + 24 * 60 * 60 * 1000)],
  );
  await client.query(
    `INSERT INTO notification_outbox (recipient_email, event_type, payload)
     VALUES ($1, 'EMAIL_VERIFICATION_REQUESTED', $2::jsonb)`,
    [user.email, JSON.stringify({ verificationUrl: `${baseUrl}/?verifyToken=${encodeURIComponent(token)}` })],
  );
}
