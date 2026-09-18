import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import { pool } from "./db.js";
import { authRouter } from "./routes/auth.js";
import { adminRouter } from "./routes/admin.js";
import { calendarRouter } from "./routes/calendar.js";
import { portalRouter } from "./routes/portal.js";
import { ticketsRouter } from "./routes/tickets.js";
import { technicianRouter } from "./routes/technician.js";
import { jobCardsRouter } from "./routes/job-cards.js";
import { startNotificationMailer } from "./services/notification-mailer.js";

const app = express();
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

app.use(helmet());
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());


app.get("/api/health", async (_request, response) => {
  try {
    await pool.query("SELECT 1");

    response.json({
      status: "ok",
      database: "connected",
    });
  } catch (error) {
    console.error("Database health check failed", error);

    response.status(503).json({
      status: "error",
      database: "unavailable",
    });
  }
});

app.get("/api/resources/user-guide", (_request, response) => {
  response.download(
    path.join(projectRoot, "output", "pdf", "csis-it-support-user-guide.pdf"),
    "csis-it-support-user-guide.pdf",
  );
});

app.use("/api/auth", authRouter);
app.use("/api/admin", adminRouter);
app.use("/api/calendar", calendarRouter);
app.use("/api/portal", portalRouter);
app.use("/api/tickets", ticketsRouter);
app.use("/api/technician", technicianRouter);
app.use("/api/job-cards", jobCardsRouter);

const port = Number(process.env.PORT ?? 3001);

app.listen(port, "127.0.0.1", () => {
  console.log(`API running at http://127.0.0.1:${port}`);
  startNotificationMailer();
});
