import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Clock3,
  Inbox,
  LoaderCircle,
  MapPin,
  RefreshCw,
  UserRound,
  Wrench,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type QueueTicket = {
  id: string;
  ticketNumber: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  locationDetails: string | null;
  stationReference: string | null;
  reporterName: string;
  reporterEmail: string;
  technicianId: string | null;
  technicianName: string | null;
  createdAt: string;
};

export function TechnicianDashboard({ userId }: { userId: string }) {
  const [tickets, setTickets] = useState<QueueTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/technician/queue", {
        credentials: "include",
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "Could not load queue");
      }

      setTickets(result.tickets);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not load the technician queue.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

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
        setError(result.error ?? "Could not claim ticket");
        return;
      }

      setMessage(`${result.ticket.ticketNumber} is now assigned to you.`);
      await loadQueue();
    } catch {
      setError("The server could not be reached.");
    } finally {
      setClaimingId(null);
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
        </CardHeader>

        <CardContent>
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
          ) : tickets.length === 0 ? (
            <div className="flex min-h-56 flex-col items-center justify-center text-center">
              <Inbox className="size-10 text-slate-300" />
              <p className="mt-4 font-medium">The queue is clear</p>
              <p className="mt-1 text-sm text-muted-foreground">
                There are no active tickets.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {tickets.map((ticket) => {
                const isMine = ticket.technicianId === userId;
                const isUnassigned = ticket.technicianId === null;

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

                      <PriorityBadge priority={ticket.priority} />
                    </div>

                    <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">
                      {ticket.description}
                    </p>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Badge variant="outline">{ticket.category}</Badge>
                      <Badge variant="secondary">
                        {formatValue(ticket.status)}
                      </Badge>
                    </div>

                    <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <UserRound className="size-4" />
                        <span>
                          {ticket.reporterName} · {ticket.reporterEmail}
                        </span>
                      </div>

                      {(ticket.locationDetails ||
                        ticket.stationReference) && (
                        <div className="flex items-center gap-2">
                          <MapPin className="size-4" />
                          <span>
                            {[ticket.locationDetails, ticket.stationReference]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <Clock3 className="size-4" />
                        <time dateTime={ticket.createdAt}>
                          Submitted{" "}
                          {new Date(ticket.createdAt).toLocaleString()}
                        </time>
                      </div>
                    </div>

                    <div className="mt-5 border-t pt-4">
                      {isMine ? (
                        <div className="flex items-center justify-between gap-3">
                          <Badge className="bg-emerald-100 text-emerald-800">
                            Assigned to you
                          </Badge>

                          <span className="text-sm text-muted-foreground">
                            Job card ready
                          </span>
                        </div>
                      ) : isUnassigned ? (
                        <Button
                          className="w-full bg-[#4B2C70] text-white hover:bg-[#3d235d]"
                          disabled={claimingId === ticket.id}
                          onClick={() => void claimTicket(ticket.id)}
                        >
                          {claimingId === ticket.id ? (
                            <LoaderCircle className="animate-spin" />
                          ) : (
                            <Wrench />
                          )}
                          {claimingId === ticket.id
                            ? "Claiming..."
                            : "Claim ticket"}
                        </Button>
                      ) : (
                        <Button className="w-full" variant="outline" disabled>
                          Assigned to {ticket.technicianName}
                        </Button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
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
  icon: React.ReactNode;
  critical?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between py-1">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
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

function PriorityBadge({ priority }: { priority: string }) {
  if (priority === "CRITICAL") {
    return <Badge variant="destructive">Critical</Badge>;
  }

  if (priority === "HIGH") {
    return <Badge className="bg-orange-100 text-orange-800">High</Badge>;
  }

  return (
    <Badge variant="secondary">
      {formatValue(priority)}
    </Badge>
  );
}

function formatValue(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
