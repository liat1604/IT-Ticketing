import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  AlertTriangle,
  Clock3,
  Eye,
  Inbox,
  LoaderCircle,
  MapPin,
  Play,
  RefreshCw,
  Search,
  Square,
  UserRound,
  Wrench,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EscalateTicketDialog } from "@/components/technician-actions";
import { CreateTicketDialog } from "@/components/create-ticket-dialog";
import { TicketDetailDialog } from "@/components/ticket-detail-dialog";
import { TicketStatusDialog } from "@/components/ticket-status-dialog";
import type { UserRole } from "@/types";
import {
  Card,CardContent,CardDescription,CardHeader,CardTitle,} from "@/components/ui/card";

type QueueTicket = {
  id: string;
  ticketNumber: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  department: string | null;
  locationDetails: string | null;
  stationReference: string | null;
  dueAt: string | null;
  parentTicketNumber: string | null;
  parentTicketTitle: string | null;
  reporterName: string;
  reporterEmail: string;
  technicianId: string | null;
  technicianName: string | null;
  createdAt: string;
  recordedSeconds: number;
  activeTimerStartedAt: string | null;
};

export function TechnicianDashboard({ userId, userRole }: { userId: string; userRole: UserRole }) {
  const [tickets, setTickets] = useState<QueueTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [timerActionId, setTimerActionId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/technician/queue", {
        credentials: "include",
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "Could not load queue.");
      }

      setNow(Date.now());
      setTickets(result.tickets);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not load the technician queue.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  useEffect(() => {
    const hasActiveTimer = tickets.some(
      (ticket) => ticket.activeTimerStartedAt !== null,
    );

    if (!hasActiveTimer) {
      return;
    }

    setNow(Date.now());

    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, [tickets]);

  async function claimTicket(ticketId: string) {
    setClaimingId(ticketId);
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        `/api/technician/${ticketId}/claim`,
        {
          method: "POST",
          credentials: "include",
        },
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "Could not claim ticket.");
      }

      setMessage(
        `${result.ticket.ticketNumber} is now assigned to you.`,
      );

      await loadQueue();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "The server could not be reached.",
      );
    } finally {
      setClaimingId(null);
    }
  }

  async function runTimer(
    ticketId: string,
    action: "start" | "stop",
  ) {
    setTimerActionId(ticketId);
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        `/api/technician/${ticketId}/timer/${action}`,
        {
          method: "POST",
          credentials: "include",
        },
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ?? `Could not ${action} the timer.`,
        );
      }

      setMessage(
        action === "start"
          ? "Work timer started."
          : "Work timer stopped and recorded.",
      );

      await loadQueue();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not update the timer.",
      );
    } finally {
      setTimerActionId(null);
    }
  }

  const assignedToMe = tickets.filter(
    (ticket) => ticket.technicianId === userId,
  ).length;

  const unassigned = tickets.filter(
    (ticket) => ticket.technicianId === null,
  ).length;

  const critical = tickets.filter(
    (ticket) => ticket.priority === "CRITICAL",
  ).length;

  const filteredTickets = useMemo(() => {
    const term = search.trim().toLowerCase();
    return tickets.filter((ticket) => {
      const matchesPriority = priorityFilter === "ALL" || ticket.priority === priorityFilter;
      const haystack = `${ticket.ticketNumber} ${ticket.title} ${ticket.description} ${ticket.reporterName} ${ticket.category}`.toLowerCase();
      return matchesPriority && (!term || haystack.includes(term));
    });
  }, [priorityFilter, search, tickets]);

  return (
    <div className="mt-8 space-y-6">
      <section className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          label="Unassigned"
          value={unassigned}
          icon={<Inbox className="size-5" />}
        />

        <SummaryCard
          label="Assigned to you"
          value={assignedToMe}
          icon={<Wrench className="size-5" />}
        />

        <SummaryCard
          label="Critical"
          value={critical}
          icon={<AlertTriangle className="size-5" />}
          critical
        />
      </section>

      <Card>
        <CardHeader className="flex-row items-start justify-between">
          <div>
            <CardTitle>Priority queue</CardTitle>

            <CardDescription>
              Active tickets ordered by urgency and submission time.
            </CardDescription>
          </div>

          <div className="flex flex-wrap gap-2">
            <CreateTicketDialog onCreated={async (ticket) => { setMessage(`${ticket.ticketNumber} was created and added to the ticket queue.`); await loadQueue(); }} />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadQueue()}
              disabled={loading}
            >
              <RefreshCw className={loading ? "animate-spin" : ""} />
              Refresh
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_180px]">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Search ticket, requester or category" aria-label="Search technician queue" />
            </label>
            <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)} className="h-10 rounded-lg border border-input bg-white px-3 text-sm" aria-label="Filter by priority">
              <option value="ALL">All priorities</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </div>
          {error && (
            <p
              className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
              role="alert"
            >
              {error}
            </p>
          )}

          {message && (
            <p
              className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
              role="status"
            >
              {message}
            </p>
          )}

          {loading ? (
            <div className="flex min-h-56 items-center justify-center">
              <LoaderCircle className="size-7 animate-spin text-[#4B2C70]" />
            </div>
          ) : filteredTickets.length === 0 ? (
            <div className="flex min-h-56 flex-col items-center justify-center text-center">
              <Inbox className="size-10 text-slate-300" />

              <p className="mt-4 font-medium">
                The queue is clear
              </p>

              <p className="mt-1 text-sm text-muted-foreground">
                No active tickets match these filters.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {filteredTickets.map((ticket) => {
                const isMine =
                  ticket.technicianId === userId;

                const isUnassigned =
                  ticket.technicianId === null;

                const isTimerRunning = Boolean(
                  ticket.activeTimerStartedAt,
                );

                const startedAtMilliseconds =
                  ticket.activeTimerStartedAt
                    ? new Date(
                        ticket.activeTimerStartedAt,
                      ).getTime()
                    : null;

                const activeSeconds =
                  startedAtMilliseconds !== null
                    ? Math.max(
                        0,
                        Math.floor(
                          (now - startedAtMilliseconds) / 1000,
                        ),
                      )
                    : 0;

                const totalSeconds =
                  ticket.recordedSeconds + activeSeconds;

                return (
                  <article
                    key={ticket.id}
                    className="rounded-xl border bg-white p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold text-[#4B2C70]">
                          {ticket.ticketNumber}
                        </p>

                        <h2 className="mt-1 text-base font-semibold">
                          {ticket.title}
                        </h2>
                      </div>

                      <PriorityBadge
                        priority={ticket.priority}
                      />
                    </div>

                    <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">
                      {ticket.description}
                    </p>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Badge variant="outline">
                        {ticket.category}
                      </Badge>

                      <Badge variant="secondary">
                        {formatValue(ticket.status)}
                      </Badge>
                      {ticket.parentTicketNumber && (
                        <Badge className="bg-purple-100 text-[#4B2C70]">
                          Sub-issue of {ticket.parentTicketNumber}
                        </Badge>
                      )}
                    </div>

                    <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <UserRound className="size-4 shrink-0" />

                        <span>
                          {ticket.reporterName} ·{" "}
                          {ticket.reporterEmail}
                        </span>
                      </div>
                      {ticket.dueAt && (
                        <div className="flex items-center gap-2">
                          <Clock3 className="size-4 shrink-0" />
                          <span>Target {new Date(ticket.dueAt).toLocaleString()}</span>
                        </div>
                      )}

                      {(ticket.locationDetails ||
                        ticket.stationReference) && (
                        <div className="flex items-center gap-2">
                          <MapPin className="size-4 shrink-0" />

                          <span>
                            {[
                              ticket.locationDetails,
                              ticket.stationReference,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </div>
                      )}
                      {ticket.department && (
                        <div className="text-sm">
                          <span className="font-medium">Department:</span> {ticket.department}
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <Clock3 className="size-4 shrink-0" />

                        <time dateTime={ticket.createdAt}>
                          Submitted{" "}
                          {new Date(
                            ticket.createdAt,
                          ).toLocaleString()}
                        </time>
                      </div>
                    </div>

                    {isMine && (
                      <div className="mt-4 flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Time on job
                          </p>

                          <time
                            className="mt-1 block font-mono text-xl font-semibold tabular-nums"
                            dateTime={`PT${totalSeconds}S`}
                          >
                            {formatDuration(totalSeconds)}
                          </time>
                        </div>

                        {isTimerRunning ? (
                          <Badge className="bg-emerald-100 text-emerald-800">
                            <span className="mr-1.5 size-2 animate-pulse rounded-full bg-emerald-600" />
                            Live
                          </Badge>
                        ) : (
                          <Badge variant="outline">
                            Stopped
                          </Badge>
                        )}
                      </div>
                    )}

                    <div className="mt-5 border-t pt-4">
                      {isMine ? (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <Badge className="bg-emerald-100 text-emerald-800">
                              Assigned to you
                            </Badge>

                            <span className="text-sm text-muted-foreground">
                              {isTimerRunning
                                ? "Work in progress"
                                : "Job card ready"}
                            </span>
                          </div>

                          <Button
                            type="button"
                            className={
                              isTimerRunning
                                ? "w-full"
                                : "w-full bg-[#4B2C70] text-white hover:bg-[#3d235d]"
                            }
                            variant={
                              isTimerRunning
                                ? "outline"
                                : "default"
                            }
                            disabled={
                              timerActionId === ticket.id
                            }
                            onClick={() =>
                              void runTimer(
                                ticket.id,
                                isTimerRunning
                                  ? "stop"
                                  : "start",
                              )
                            }
                          >
                            {timerActionId === ticket.id ? (
                              <LoaderCircle className="animate-spin" />
                            ) : isTimerRunning ? (
                              <Square />
                            ) : (
                              <Play />
                            )}

                            {timerActionId === ticket.id
                              ? "Updating..."
                              : isTimerRunning
                                ? "Stop timer"
                                : ticket.recordedSeconds > 0
                                  ? "Resume work"
                                  : "Start work"}
                          </Button>
                          <TicketStatusDialog
                            ticket={ticket}
                            onUpdated={async (updatedMessage) => {
                              setMessage(updatedMessage);
                              await loadQueue();
                            }}
                          />
                          {ticket.status !== "ESCALATED" && ticket.status !== "RESOLVED" && (
                            <EscalateTicketDialog
                              ticket={ticket}
                              onEscalated={async (updatedMessage) => {
                                setMessage(updatedMessage);
                                await loadQueue();
                              }}
                            />
                          )}
                          <Button type="button" variant="outline" className="w-full" onClick={() => setSelectedTicketId(ticket.id)}>
                            <Eye /> View history and comments
                          </Button>
                        </div>
                      ) : isUnassigned ? (
                        <div className="space-y-2">
                          <Button
                            type="button"
                            className="w-full bg-[#4B2C70] text-white hover:bg-[#3d235d]"
                            disabled={claimingId === ticket.id}
                            onClick={() => void claimTicket(ticket.id)}
                          >
                            {claimingId === ticket.id ? <LoaderCircle className="animate-spin" /> : <Wrench />}
                            {claimingId === ticket.id ? "Claiming..." : "Claim ticket"}
                          </Button>
                          <Button type="button" variant="outline" className="w-full" onClick={() => setSelectedTicketId(ticket.id)}>
                            <Eye /> View details
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <Button type="button" className="w-full" variant="outline" disabled>
                            Assigned to {ticket.technicianName ?? "another technician"}
                          </Button>
                          <Button type="button" variant="outline" className="w-full" onClick={() => setSelectedTicketId(ticket.id)}>
                            <Eye /> View details
                          </Button>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      <TicketDetailDialog
        ticketId={selectedTicketId}
        open={selectedTicketId !== null}
        role={userRole}
        onOpenChange={(open) => !open && setSelectedTicketId(null)}
        onChanged={loadQueue}
      />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  critical = false,
}: {
  label: string;
  value: number;
  icon: ReactNode;
  critical?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between py-1">
        <div>
          <p className="text-sm text-muted-foreground">
            {label}
          </p>

          <p
            className={
              critical
                ? "mt-1 text-2xl font-semibold text-red-700"
                : "mt-1 text-2xl font-semibold"
            }
          >
            {value}
          </p>
        </div>

        <div
          className={
            critical
              ? "rounded-xl bg-red-50 p-3 text-red-700"
              : "rounded-xl bg-purple-50 p-3 text-[#4B2C70]"
          }
        >
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}

function PriorityBadge({
  priority,
}: {
  priority: string;
}) {
  if (priority === "CRITICAL") {
    return (
      <Badge variant="destructive">
        Critical
      </Badge>
    );
  }

  if (priority === "HIGH") {
    return (
      <Badge className="bg-orange-100 text-orange-800">
        High
      </Badge>
    );
  }

  return (
    <Badge variant="secondary">
      {formatValue(priority)}
    </Badge>
  );
}

function formatDuration(totalSeconds: number) {
  const safeSeconds = Math.max(
    0,
    Math.floor(totalSeconds),
  );

  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor(
    (safeSeconds % 3600) / 60,
  );
  const seconds = safeSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

function formatValue(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase(),
    );
}
