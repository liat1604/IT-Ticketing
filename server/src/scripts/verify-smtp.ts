import nodemailer from "nodemailer";
import "../db.js";

const host = process.env.SMTP_HOST;
const user = process.env.SMTP_USER;
const password = process.env.SMTP_PASSWORD?.replace(/\s/g, "");
const port = Number(process.env.SMTP_PORT ?? 465);

if (!host || !user || !password) {
  throw new Error("SMTP_HOST, SMTP_USER, and SMTP_PASSWORD are required");
}

const transporter = nodemailer.createTransport({
  host,
  port,
  secure: port === 465,
  auth: { user, pass: password },
});

await transporter.verify();
console.log(`SMTP connection verified for ${user}`);
