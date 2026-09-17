import { createHash } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { pool } from "../db.js";

export type AuthenticatedUser = {
  id: string;
  email: string;
  fullName: string;
  role: "REPORTER" | "TECHNICIAN" | "ADMIN" | "SYSTEM_ADMIN";
};

export type AuthenticatedRequest = Request & {
  user: AuthenticatedUser;
};

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function requireAuth(
  request: Request,
  response: Response,
  next: NextFunction,
) {
  const token = request.cookies?.csis_session as string | undefined;

  if (!token) {
    response.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const result = await pool.query<{
      id: string;
      email: string;
      full_name: string;
      role: AuthenticatedUser["role"];
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

    (request as AuthenticatedRequest).user = {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
    };

    next();
  } catch (error) {
    console.error("Session validation failed", error);
    response.status(500).json({ error: "Session validation failed" });
  }
}

export function requireRole(...allowedRoles: AuthenticatedUser["role"][]) {
  return (
    request: Request,
    response: Response,
    next: NextFunction,
  ) => {
    const user = (request as AuthenticatedRequest).user;

    if (!user || !allowedRoles.includes(user.role)) {
      response.status(403).json({
        error: "You do not have permission to perform this action",
      });
      return;
    }

    next();
  };
}