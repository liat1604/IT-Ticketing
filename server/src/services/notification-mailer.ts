import nodemailer from "nodemailer";
import { pool } from "../db.js";

type PendingNotification = {
  id: string;
  recipient_email: string;
  event_type: string;
  payload: Record<string, unknown>;
};

const pollIntervalMilliseconds = 10_000;
const maxAttempts = 5;

function textValue(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : undefined;
}

function createMessage(notification: PendingNotification) {
  const ticketNumber = textValue(notification.payload.ticketNumber);
  const title = textValue(notification.payload.title);
  const status = textValue(notification.payload.status);
  const technicianName = textValue(notification.payload.technicianName);
  const eventName = notification.event_type
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  const ticketLabel = ticketNumber ? ` ${ticketNumber}` : "";
  const details = [
    ticketNumber && `Ticket: ${ticketNumber}`,
    title && `Title: ${title}`,
    status && `Status: ${status.replaceAll("_", " ")}`,
    technicianName && `Technician: ${technicianName}`,
  ].filter(Boolean);

  return {
    subject: `[CSIS IT Support]${ticketLabel}: ${eventName}`,
    text: [
      "Hello,",
      "",
      `There is an update to your CSIS IT support request: ${eventName}.`,
      ...(details.length > 0 ? ["", ...details] : []),
      "",
      "Sign in to the CSIS IT Support portal for the latest details.",
      "",
      "This is an automated notification. Please do not reply.",
    ].join("\n"),
  };
}

export function startNotificationMailer() {
  if (process.env.SMTP_ENABLED !== "true") {
    console.log("Email notifications are disabled");
    return;
  }

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD?.replace(/\s/g, "");
  const from = process.env.SMTP_FROM ?? user;

  if (!host || !user || !password || !from) {
    console.error("Email notifications require SMTP_HOST, SMTP_USER, SMTP_PASSWORD, and SMTP_FROM");
    return;
  }

  const port = Number(process.env.SMTP_PORT ?? 465);
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass: password },
  });
  let processing = false;

  async function processNext() {
    if (processing) return;
    processing = true;

    try {
      const result = await pool.query<PendingNotification>(
        `UPDATE notification_outbox
         SET attempts = attempts + 1
         WHERE id = (
           SELECT id
           FROM notification_outbox
           WHERE processed_at IS NULL AND attempts < $1
           ORDER BY created_at
           LIMIT 1
           FOR UPDATE SKIP LOCKED
         )
         RETURNING id, recipient_email, event_type, payload`,
        [maxAttempts],
      );
      const notification = result.rows[0];

      if (!notification) return;

      try {
        await transporter.sendMail({
          from,
          to: notification.recipient_email,
          ...createMessage(notification),
        });
        await pool.query(
          `UPDATE notification_outbox
           SET processed_at = CURRENT_TIMESTAMP, last_error = NULL
           WHERE id = $1`,
          [notification.id],
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown SMTP error";
        await pool.query(
          `UPDATE notification_outbox SET last_error = $2 WHERE id = $1`,
          [notification.id, message.slice(0, 1000)],
        );
        console.error("Email notification failed", message);
      }
    } catch (error) {
      console.error("Notification worker failed", error);
    } finally {
      processing = false;
    }
  }

  console.log(`Email notifications enabled for ${user}`);
  void processNext();
  setInterval(() => void processNext(), pollIntervalMilliseconds).unref();
}
