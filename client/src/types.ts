export type UserRole = "REPORTER" | "TECHNICIAN" | "ADMIN" | "SYSTEM_ADMIN";

export type User = {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
};

export type TicketSummary = {
  id: string;
  ticketNumber: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  locationDetails: string | null;
  stationReference: string | null;
  createdAt: string;
  updatedAt?: string;
  resolvedAt?: string | null;
  resolutionSummary?: string | null;
  reporterName?: string;
  reporterEmail?: string;
  technicianId?: string | null;
  technicianName?: string | null;
  recordedSeconds?: number;
  activeTimerStartedAt?: string | null;
  commentCount?: number;
  source?: string;
  parentTicketNumber?: string | null;
  dueAt?: string | null;
};

export type PortalSection =
  | "overview"
  | "tickets"
  | "job-cards"
  | "calendar"
  | "reports"
  | "users"
  | "audit"
  | "system";
