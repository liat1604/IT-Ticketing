import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  CheckCircle2,
  Clock3,
  CircleStop,
  LoaderCircle,
  Pause,
  Play,
  Plus,
  Search,
  ShieldAlert,
} from "lucide-react";

import { TicketDetailDialog } from "@/components/ticket-detail-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, formatDuration, formatValue, relativeTime } from "@/lib/api";
import type { User } from "@/types";

type PriorityLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

type JobCard = {
  id: string;
  jobNumber: string;
  title: string;
  description: string;
  status: string;
  ticketId: string | null;
  ticketNumber: string | null;
  ticketTitle: string | null;
  isWalkIn: boolean;
  priority: PriorityLevel;
  category: string;
  technicianId: string;
  technicianName: string;
  technicianRole: string;
  reporterName: string;
  reporterEmail: string | null;
  totalSeconds: number;
  activeTimerStartedAt: string | null;
  scheduledAt: string | null;
  targetAt: string | null;
  completionNote: string | null;
  completedAt: string | null;
  location: string | null;
  stationReference: string | null;
  createdAt: string;
};

type Detail = JobCard & {
  checklist: Array<{ id: string; body: string; isComplete: boolean }>;
  notes: Array<{ id: string; body: string; authorName: string; createdAt: string }>;
  timeEntries: Array<{
    id: string;
    startedAt: string;
    stoppedAt: string | null;
    durationSeconds: number;
  }>;
  history: Array<{
    id: number;
    action: string;
    actorName: string;
    createdAt: string;
  }>;
};

type TicketOption = {
  id: string;
  ticketNumber: string;
  title: string;
  description: string;
  priority: PriorityLevel;
  categoryId: number;
  locationId: number | null;
  locationDetails: string | null;
  stationReference: string | null;
  assignedTo: string | null;
  reporterName: string;
  reporterEmail: string;
};

type NamedOption = { id: string | number; name?: string; fullName?: string };
type JobCardOptions = {
  tickets: TicketOption[];
  technicians: NamedOption[];
  categories: NamedOption[];
  locations: NamedOption[];
};

type JobCardForm = {
  primaryTicketId: string;
  relatedTicketIds: string[];
  title: string;
  description: string;
  assignedTo: string;
  categoryId: string;
  priority: PriorityLevel;
  locationId: string;
  locationDetails: string;
  stationReference: string;
  scheduledAt: string;
  targetAt: string;
  checklist: string;
  internalNotes: string;
  walkInReporterName: string;
  walkInReporterEmail: string;
};

const badgePalette = {
  pending: "border-[#DC2626] bg-[#FEE2E2] text-[#991B1B]",
  progress: "border-[#D97706] bg-[#FEF3C7] text-[#92400E]",
  resolved: "border-[#16A34A] bg-[#DCFCE7] text-[#166534]",
  neutral: "border-[#64748B] bg-[#F1F5F9] text-[#475569]",
  brand: "border-[#4B2C70] bg-[#F3E8FF] text-[#4B2C70]",
} as const;

const kanbanColumns = [
  {
    status: "SCHEDULED",
    label: "Pending",
    helper: "Ready to be started",
    className: "border-[#FECACA] bg-[#FEF2F2]",
    badgeClass: badgePalette.pending,
  },
  {
    status: "LIVE",
    label: "In progress",
    helper: "Technician timer running",
    className: "border-[#FDE68A] bg-[#FFFBEB]",
    badgeClass: badgePalette.progress,
  },
  {
    status: "PAUSED",
    label: "Paused",
    helper: "Waiting to resume",
    className: "border-[#CBD5E1] bg-[#F8FAFC]",
    badgeClass: badgePalette.neutral,
  },
  {
    status: "ESCALATED",
    label: "Escalated",
    helper: "Needs supervisor attention",
    className: "border-[#FECACA] bg-[#FEF2F2]",
    badgeClass: badgePalette.pending,
  },
  {
    status: "COMPLETED",
    label: "Resolved",
    helper: "Work completed",
    className: "border-[#BBF7D0] bg-[#F0FDF4]",
    badgeClass: badgePalette.resolved,
  },
  {
    status: "CANCELLED",
    label: "Cancelled",
    helper: "No longer active",
    className: "border-[#CBD5E1] bg-[#F8FAFC]",
    badgeClass: badgePalette.neutral,
  },
] as const;

export function JobCardsDashboard({
  user,
  onActiveCountChange,
}: {
  user: User;
  onActiveCountChange: (count: number) => void;
}) {
  const [cards, setCards] = useState<JobCard[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ search, status });
      const result = await api<{ jobCards: JobCard[] }>(
        `/api/job-cards?${query}`,
      );
      setCards(result.jobCards);
      onActiveCountChange(
        result.jobCards.filter((card) =>
          ["SCHEDULED", "LIVE", "PAUSED", "ESCALATED"].includes(card.status),
        ).length,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load job cards");
    } finally {
      setLoading(false);
    }
  }, [onActiveCountChange, search, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 200);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const counts = useMemo(
    () =>
      Object.fromEntries(
        ["LIVE", "SCHEDULED", "PAUSED", "ESCALATED", "COMPLETED"].map((value) => [
          value,
          cards.filter((card) => card.status === value).length,
        ]),
      ) as Record<string, number>,
    [cards],
  );
  const overdue = cards.filter(
    (card) =>
      card.targetAt &&
      new Date(card.targetAt).getTime() < now &&
      !["COMPLETED", "CANCELLED"].includes(card.status),
  ).length;
  const live = cards.find((card) => card.status === "LIVE");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Technician job cards
          </h1>
          <p className="text-sm text-muted-foreground">
            Track linked ticket work and manually captured walk-in jobs.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge className={badgePalette.brand}>
            {counts.LIVE + counts.SCHEDULED + counts.PAUSED + counts.ESCALATED} active
          </Badge>
          <Button
            className="bg-[#4B2C70] text-white hover:bg-[#3d235d]"
            onClick={() => setCreateOpen(true)}
          >
            <Plus /> Create job card
          </Button>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
        <Stat
          label="Active"
          value={counts.LIVE + counts.SCHEDULED + counts.PAUSED + counts.ESCALATED}
        />
        <Stat label="Live" value={counts.LIVE} />
        <Stat label="Scheduled" value={counts.SCHEDULED} />
        <Stat label="Paused" value={counts.PAUSED} />
        <Stat label="Escalated" value={counts.ESCALATED} />
        <Stat label="Completed" value={counts.COMPLETED} />
        <Stat label="Overdue" value={overdue} />
      </section>

      {live && (
        <Card className="overflow-hidden border-purple-200">
          <div className="bg-[#4B2C70] p-5 text-white">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <Badge className={badgePalette.progress}>LIVE</Badge>
                <p className="mt-3 text-sm text-purple-200">
                  {live.jobNumber} · {live.category.toUpperCase()}
                </p>
                <h2 className="mt-1 text-2xl font-semibold">{live.title}</h2>
                <p className="mt-2 text-purple-100">
                  {live.ticketNumber
                    ? `Linked ticket: ${live.ticketNumber} — ${live.ticketTitle}`
                    : `Walk-in job · ${live.reporterName}`}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-purple-200">Time on job</p>
                <p className="font-mono text-4xl font-semibold">
                  {formatDuration(elapsed(live, now))}
                </p>
              </div>
            </div>
          </div>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <p className="text-sm">
              Assigned to <strong>{live.technicianName}</strong>
              {live.location && ` · ${live.location}`}
            </p>
            <Button onClick={() => setSelected(live.id)}>Open job card</Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
            <label className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search job card, ticket or requester"
              />
            </label>
            <select
              className={selectClasses}
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="ALL">All statuses</option>
              {[
                "SCHEDULED",
                "LIVE",
                "PAUSED",
                "ESCALATED",
                "COMPLETED",
                "CANCELLED",
              ].map(
                (item) => (
                  <option key={item}>{item}</option>
                ),
              )}
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {error && <ErrorText text={error} />}
          {loading ? (
            <Loading />
          ) : (
            <div className="overflow-x-auto pb-3">
              <div className="grid min-w-[1400px] grid-cols-5 gap-4">
                {kanbanColumns.map((column) => {
                  const columnCards = cards.filter(
                    (card) => card.status === column.status,
                  );
                  return (
                    <section
                      key={column.status}
                      className={`min-h-80 overflow-hidden rounded-2xl border ${column.className}`}
                      aria-label={`${column.label} job cards`}
                    >
                      <header className="flex items-start justify-between gap-3 border-b p-4">
                        <div>
                          <h3 className="font-semibold">{column.label}</h3>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {column.helper}
                          </p>
                        </div>
                        <Badge className={column.badgeClass}>
                          {columnCards.length}
                        </Badge>
                      </header>
                      <div className="min-h-56 space-y-3 p-3">
                        {columnCards.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-slate-300 bg-white/60 p-4 text-center text-xs text-muted-foreground">
                            No job cards
                          </div>
                        ) : (
                          columnCards.map((card) => (
                            <button
                              key={card.id}
                              onClick={() => setSelected(card.id)}
                              className="w-full rounded-xl border bg-white p-4 text-left transition hover:border-[#4B2C70] hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B2C70]/40"
                            >
                              <div className="flex justify-between gap-2">
                                <Status status={card.status} />
                                <Priority value={card.priority} />
                              </div>
                              <p className="mt-3 text-xs font-semibold text-[#4B2C70]">
                                {card.jobNumber} · {card.category.toUpperCase()}
                              </p>
                              <h3 className="mt-1 font-semibold">{card.title}</h3>
                              <p className="mt-2 text-sm text-muted-foreground">
                                {card.ticketNumber
                                  ? `${card.ticketNumber} · ${card.reporterName}`
                                  : `Walk-in · ${card.reporterName}`}
                              </p>
                              <p className="mt-3 text-sm">{card.technicianName}</p>
                              <div className="mt-3 flex justify-between text-xs text-muted-foreground">
                                <span>{card.location ?? "No location"}</span>
                                <span className="font-mono">
                                  {formatDuration(elapsed(card, now))}
                                </span>
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <CreateJobCardDialog
        open={createOpen}
        user={user}
        onOpenChange={setCreateOpen}
        onCreated={load}
      />
      <JobCardDetail
        id={selected}
        user={user}
        onClose={() => setSelected(null)}
        onChanged={load}
      />
    </div>
  );
}

function emptyForm(user: User): JobCardForm {
  return {
    primaryTicketId: "",
    relatedTicketIds: [],
    title: "",
    description: "",
    assignedTo: user.role === "TECHNICIAN" ? user.id : "",
    categoryId: "",
    priority: "MEDIUM",
    locationId: "",
    locationDetails: "",
    stationReference: "",
    scheduledAt: "",
    targetAt: "",
    checklist: "",
    internalNotes: "",
    walkInReporterName: "",
    walkInReporterEmail: "",
  };
}

function CreateJobCardDialog({
  open,
  user,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  user: User;
  onOpenChange: (value: boolean) => void;
  onCreated: () => Promise<void>;
}) {
  const [options, setOptions] = useState<JobCardOptions | null>(null);
  const [form, setForm] = useState<JobCardForm>(() => emptyForm(user));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError("");
    void api<JobCardOptions>("/api/job-cards/options")
      .then((result) => {
        if (cancelled) return;
        setOptions(result);
        setForm(emptyForm(user));
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Could not load options");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, user]);

  const selectedTicket = options?.tickets.find(
    (ticket) => ticket.id === form.primaryTicketId,
  );

  function update<K extends keyof JobCardForm>(key: K, value: JobCardForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function selectTicket(ticketId: string) {
    if (!ticketId) {
      setForm((current) => ({
        ...current,
        primaryTicketId: "",
        relatedTicketIds: [],
        title: "",
        description: "",
        categoryId: "",
        priority: "MEDIUM",
        locationId: "",
        locationDetails: "",
        stationReference: "",
        assignedTo: user.role === "TECHNICIAN" ? user.id : current.assignedTo,
        walkInReporterName: "",
        walkInReporterEmail: "",
      }));
      return;
    }

    const ticket = options?.tickets.find((item) => item.id === ticketId);
    if (!ticket) return;
    setForm((current) => ({
      ...current,
      primaryTicketId: ticket.id,
      relatedTicketIds: current.relatedTicketIds.filter((id) => id !== ticket.id),
      title: ticket.title,
      description: ticket.description,
      categoryId: String(ticket.categoryId),
      priority: ticket.priority,
      locationId: ticket.locationId ? String(ticket.locationId) : "",
      locationDetails: ticket.locationDetails ?? "",
      stationReference: ticket.stationReference ?? "",
      assignedTo:
        ticket.assignedTo ??
        (user.role === "TECHNICIAN" ? user.id : current.assignedTo),
      walkInReporterName: "",
      walkInReporterEmail: "",
    }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api("/api/job-cards", {
        method: "POST",
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          primaryTicketId: form.primaryTicketId || null,
          relatedTicketIds: form.relatedTicketIds,
          assignedTo: form.assignedTo,
          categoryId: Number(form.categoryId),
          priority: form.priority,
          locationId: form.locationId ? Number(form.locationId) : null,
          locationDetails: form.locationDetails,
          stationReference: form.stationReference,
          scheduledAt: form.scheduledAt
            ? new Date(form.scheduledAt).toISOString()
            : null,
          targetAt: form.targetAt ? new Date(form.targetAt).toISOString() : null,
          checklist: form.checklist
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean),
          internalNotes: form.internalNotes,
          walkInReporterName: form.primaryTicketId
            ? null
            : form.walkInReporterName,
          walkInReporterEmail: form.primaryTicketId
            ? null
            : form.walkInReporterEmail,
        }),
      });
      onOpenChange(false);
      setForm(emptyForm(user));
      await onCreated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create job card");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Create job card</DialogTitle>
            <DialogDescription>
              Select a ticket to prefill its information, or leave it blank to
              capture a walk-in job manually.
            </DialogDescription>
          </DialogHeader>
          {!options ? (
            <Loading />
          ) : (
            <div className="grid gap-4 py-5 sm:grid-cols-2">
              <Field label="Linked ticket (optional)" span>
                <select
                  name="primaryTicketId"
                  className={selectClasses}
                  value={form.primaryTicketId}
                  onChange={(event) => selectTicket(event.target.value)}
                >
                  <option value="">No ticket — manual walk-in job</option>
                  {options.tickets.map((ticket) => (
                    <option key={ticket.id} value={ticket.id}>
                      {ticket.ticketNumber} — {ticket.title}
                    </option>
                  ))}
                </select>
              </Field>

              {selectedTicket ? (
                <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 text-sm sm:col-span-2">
                  <p className="font-semibold text-[#4B2C70]">
                    Ticket information loaded
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {selectedTicket.reporterName} · {selectedTicket.reporterEmail}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Title, description, priority, category, location, station and
                    assigned technician were copied into the job card and can be
                    adjusted if required.
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm sm:col-span-2">
                  <p className="font-semibold text-amber-900">Walk-in job</p>
                  <p className="mt-1 text-amber-800">
                    Enter the requester's name and the job information manually.
                    No support ticket will be created.
                  </p>
                </div>
              )}

              {!selectedTicket && (
                <>
                  <Field label="Walk-in requester name">
                    <Input
                      value={form.walkInReporterName}
                      onChange={(event) =>
                        update("walkInReporterName", event.target.value)
                      }
                      minLength={2}
                      required
                    />
                  </Field>
                  <Field label="Requester email (optional)">
                    <Input
                      value={form.walkInReporterEmail}
                      onChange={(event) =>
                        update("walkInReporterEmail", event.target.value)
                      }
                      type="email"
                      placeholder="name@mynwu.ac.za"
                    />
                  </Field>
                </>
              )}

              <Field label="Job title">
                <Input
                  value={form.title}
                  onChange={(event) => update("title", event.target.value)}
                  minLength={5}
                  required
                />
              </Field>
              <Field label="Assigned technician">
                <select
                  className={selectClasses}
                  value={form.assignedTo}
                  onChange={(event) => update("assignedTo", event.target.value)}
                  required
                >
                  <option value="">Select technician</option>
                  {options.technicians.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.fullName}
                    </option>
                  ))}
                </select>
              </Field>

              {selectedTicket && (
                <Field label="Related tickets" span>
                  <select
                    className={`${selectClasses} h-24`}
                    multiple
                    value={form.relatedTicketIds}
                    onChange={(event) =>
                      update(
                        "relatedTicketIds",
                        Array.from(
                          event.currentTarget.selectedOptions,
                          (option) => option.value,
                        ),
                      )
                    }
                  >
                    {options.tickets
                      .filter((ticket) => ticket.id !== form.primaryTicketId)
                      .map((ticket) => (
                        <option key={ticket.id} value={ticket.id}>
                          {ticket.ticketNumber} — {ticket.title}
                        </option>
                      ))}
                  </select>
                </Field>
              )}

              <Field label="Category">
                <select
                  className={selectClasses}
                  value={form.categoryId}
                  onChange={(event) => update("categoryId", event.target.value)}
                  required
                >
                  <option value="">Select category</option>
                  {options.categories.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Priority">
                <select
                  className={selectClasses}
                  value={form.priority}
                  onChange={(event) =>
                    update("priority", event.target.value as PriorityLevel)
                  }
                  required
                >
                  {(["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const).map(
                    (priority) => (
                      <option key={priority} value={priority}>
                        {formatValue(priority)}
                      </option>
                    ),
                  )}
                </select>
              </Field>
              <Field label="Campus location">
                <select
                  className={selectClasses}
                  value={form.locationId}
                  onChange={(event) => update("locationId", event.target.value)}
                >
                  <option value="">Select location</option>
                  {options.locations.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Location details">
                <Input
                  value={form.locationDetails}
                  onChange={(event) => update("locationDetails", event.target.value)}
                />
              </Field>
              <Field label="Station or asset">
                <Input
                  value={form.stationReference}
                  onChange={(event) =>
                    update("stationReference", event.target.value)
                  }
                />
              </Field>
              <Field label="Scheduled date/time">
                <Input
                  value={form.scheduledAt}
                  onChange={(event) => update("scheduledAt", event.target.value)}
                  type="datetime-local"
                />
              </Field>
              <Field label="Target completion">
                <Input
                  value={form.targetAt}
                  onChange={(event) => update("targetAt", event.target.value)}
                  type="datetime-local"
                />
              </Field>
              <Field label="Work description" span>
                <Textarea
                  value={form.description}
                  onChange={(event) => update("description", event.target.value)}
                  minLength={10}
                  required
                />
              </Field>
              <Field label="Initial checklist items (one per line)" span>
                <Textarea
                  value={form.checklist}
                  onChange={(event) => update("checklist", event.target.value)}
                />
              </Field>
              <Field label="Internal notes" span>
                <Textarea
                  value={form.internalNotes}
                  onChange={(event) => update("internalNotes", event.target.value)}
                />
              </Field>
              {error && (
                <div className="sm:col-span-2">
                  <ErrorText text={error} />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button disabled={saving || !options}>
              {saving ? <LoaderCircle className="animate-spin" /> : <Plus />}
              {saving ? "Creating..." : "Create job card"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function JobCardDetail({
  id,
  user,
  onClose,
  onChanged,
}: {
  id: string | null;
  user: User;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [card, setCard] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [ticketOpen, setTicketOpen] = useState(false);
  const [resolutionOpen, setResolutionOpen] = useState(false);
  const [completionNote, setCompletionNote] = useState("");

  const load = useCallback(async () => {
    if (id) {
      setCard((await api<{ jobCard: Detail }>(`/api/job-cards/${id}`)).jobCard);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setResolutionOpen(false);
    setCompletionNote("");
  }, [id]);

  async function action(path: string, body?: unknown) {
    if (!id) return false;
    setError("");
    try {
      await api(`/api/job-cards/${id}/${path}`, {
        method: path.startsWith("checklist") ? "PATCH" : "POST",
        body: body ? JSON.stringify(body) : undefined,
      });
      await load();
      await onChanged();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Action failed");
      return false;
    }
  }

  async function completeJobCard() {
    const trimmed = completionNote.trim();
    if (trimmed.length < 5) {
      setError("Enter a completion note of at least 5 characters.");
      return;
    }
    if (await action("complete", { completionNote: trimmed })) {
      setCompletionNote("");
      setResolutionOpen(false);
    }
  }

  const canManage =
    card &&
    (user.role === "ADMIN" ||
      user.role === "SYSTEM_ADMIN" ||
      card.technicianId === user.id);

  return (
    <>
      <Dialog open={id !== null} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
          {!card ? (
            <Loading />
          ) : (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <Status status={card.status} />
                  <span className="text-sm font-semibold text-[#4B2C70]">
                    {card.jobNumber}
                  </span>
                  {card.isWalkIn && (
                    <Badge className={badgePalette.progress}>Walk-in</Badge>
                  )}
                </div>
                <DialogTitle className="text-xl">{card.title}</DialogTitle>
                <DialogDescription>
                  {card.ticketNumber
                    ? `${card.ticketNumber} — ${card.ticketTitle}`
                    : "Manually captured walk-in job card"}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-5 py-3 md:grid-cols-2">
                <Card>
                  <CardContent className="pt-5">
                    <p className="text-sm text-muted-foreground">Total time</p>
                    <p className="mt-1 font-mono text-3xl">
                      {formatDuration(
                        card.timeEntries.reduce(
                          (sum, item) => sum + item.durationSeconds,
                          0,
                        ),
                      )}
                    </p>
                    {canManage && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {card.status === "SCHEDULED" && (
                          <Button onClick={() => void action("timer/start")}>
                            <Play /> Start
                          </Button>
                        )}
                        {card.status === "LIVE" && (
                          <Button
                            variant="outline"
                            onClick={() => void action("timer/pause")}
                          >
                            <Pause /> Pause
                          </Button>
                        )}
                        {card.status === "PAUSED" && (
                          <Button onClick={() => void action("timer/resume")}>
                            <Play /> Resume
                          </Button>
                        )}
                        {card.isWalkIn &&
                          !["COMPLETED", "CANCELLED", "ESCALATED"].includes(
                            card.status,
                          ) && (
                            <Button
                              variant="outline"
                              onClick={() => {
                                const reason = window.prompt(
                                  "Why does this walk-in job need escalation?",
                                );
                                if (reason) {
                                  void action("escalate", { reason });
                                }
                              }}
                            >
                              <ShieldAlert /> Escalate
                            </Button>
                          )}
                        {card.isWalkIn &&
                          !["COMPLETED", "CANCELLED"].includes(card.status) && (
                            <Button
                              variant="destructive"
                              onClick={() => {
                                const endNote = window.prompt(
                                  "Why is this walk-in job being ended?",
                                );
                                if (endNote) {
                                  void action("end", { endNote });
                                }
                              }}
                            >
                              <CircleStop /> End job
                            </Button>
                          )}
                        {!["COMPLETED", "CANCELLED"].includes(card.status) && (
                          <Button
                            variant="outline"
                            onClick={() => setResolutionOpen((open) => !open)}
                          >
                            <CheckCircle2 />
                            {card.isWalkIn ? "Mark resolved" : "Complete"}
                          </Button>
                        )}
                      </div>
                    )}
                    {canManage &&
                      resolutionOpen &&
                      !["COMPLETED", "CANCELLED"].includes(card.status) && (
                        <div className="mt-4 space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                          <Label htmlFor="completion-note">Resolution note</Label>
                          <Textarea
                            id="completion-note"
                            value={completionNote}
                            onChange={(event) => setCompletionNote(event.target.value)}
                            placeholder="Describe what was completed or verified"
                            maxLength={2000}
                          />
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => setResolutionOpen(false)}
                            >
                              Cancel
                            </Button>
                            <Button type="button" onClick={() => void completeJobCard()}>
                              <CheckCircle2 /> Confirm resolved
                            </Button>
                          </div>
                        </div>
                      )}
                  </CardContent>
                </Card>
                <div className="space-y-1 text-sm">
                  <p>
                    <strong>Technician:</strong> {card.technicianName} (
                    {formatValue(card.technicianRole)})
                  </p>
                  <p>
                    <strong>Requester:</strong> {card.reporterName}
                    {card.reporterEmail ? ` · ${card.reporterEmail}` : ""}
                  </p>
                  <p>
                    <strong>Location:</strong> {card.location ?? "—"}{" "}
                    {card.stationReference ?? ""}
                  </p>
                  <p>
                    <strong>Scheduled:</strong>{" "}
                    {card.scheduledAt
                      ? new Date(card.scheduledAt).toLocaleString()
                      : "—"}
                  </p>
                  <p>
                    <strong>Target:</strong>{" "}
                    {card.targetAt ? new Date(card.targetAt).toLocaleString() : "—"}
                  </p>
                  {card.completionNote && (
                    <p>
                      <strong>Resolution:</strong> {card.completionNote}
                    </p>
                  )}
                  {card.ticketId && (
                    <Button
                      className="mt-3"
                      variant="outline"
                      onClick={() => setTicketOpen(true)}
                    >
                      Open complete ticket
                    </Button>
                  )}
                </div>
                <section>
                  <h3 className="font-semibold">Checklist</h3>
                  <div className="mt-2 space-y-2">
                    {card.checklist.map((item) => (
                      <label key={item.id} className="flex gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={item.isComplete}
                          disabled={!canManage}
                          onChange={(event) =>
                            void action(`checklist/${item.id}`, {
                              isComplete: event.target.checked,
                            })
                          }
                        />
                        <span
                          className={
                            item.isComplete ? "text-muted-foreground line-through" : ""
                          }
                        >
                          {item.body}
                        </span>
                      </label>
                    ))}
                  </div>
                </section>
                <section>
                  <h3 className="font-semibold">Internal work notes</h3>
                  <div className="mt-2 flex gap-2">
                    <Input
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      placeholder="Add internal note"
                    />
                    <Button
                      disabled={!note.trim()}
                      onClick={() =>
                        void action("notes", { body: note }).then(() => setNote(""))
                      }
                    >
                      Add
                    </Button>
                  </div>
                  <div className="mt-2 space-y-2">
                    {card.notes.map((item) => (
                      <p key={item.id} className="rounded-lg bg-slate-50 p-2 text-sm">
                        <strong>{item.authorName}:</strong> {item.body}
                      </p>
                    ))}
                  </div>
                </section>
                <section>
                  <h3 className="font-semibold">Time entries</h3>
                  {card.timeEntries.map((item) => (
                    <p key={item.id} className="mt-2 text-sm">
                      <Clock3 className="mr-1 inline size-4" />
                      {new Date(item.startedAt).toLocaleString()} ·{" "}
                      {formatDuration(item.durationSeconds)}
                    </p>
                  ))}
                </section>
                <section className="md:col-span-2">
                  <h3 className="font-semibold">Activity history</h3>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {card.history.map((item) => (
                      <p key={item.id} className="rounded-lg border p-2 text-xs">
                        {formatValue(item.action)} · {item.actorName ?? "System"} ·{" "}
                        {relativeTime(item.createdAt)}
                      </p>
                    ))}
                  </div>
                </section>
                {error && (
                  <div className="md:col-span-2">
                    <ErrorText text={error} />
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={onClose}>
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      {card?.ticketId && (
        <TicketDetailDialog
          ticketId={card.ticketId}
          open={ticketOpen}
          role={user.role}
          onOpenChange={setTicketOpen}
          onChanged={load}
        />
      )}
    </>
  );
}

function elapsed(card: JobCard, now: number) {
  return (
    card.totalSeconds +
    (card.activeTimerStartedAt
      ? Math.max(
          0,
          Math.floor(
            (now - new Date(card.activeTimerStartedAt).getTime()) / 1000,
          ),
        )
      : 0)
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

function Status({ status }: { status: string }) {
  const style =
    status === "COMPLETED"
      ? badgePalette.resolved
      : status === "LIVE"
        ? badgePalette.progress
        : status === "SCHEDULED" || status === "ESCALATED"
          ? badgePalette.pending
          : badgePalette.neutral;
  return <Badge className={style}>{formatValue(status)}</Badge>;
}

function Priority({ value }: { value: string }) {
  const style =
    value === "CRITICAL" || value === "HIGH"
      ? badgePalette.pending
      : badgePalette.neutral;
  return <Badge className={style}>{formatValue(value)}</Badge>;
}

function Field({
  label,
  span = false,
  children,
}: {
  label: string;
  span?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={span ? "space-y-2 sm:col-span-2" : "space-y-2"}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Loading() {
  return (
    <div className="flex min-h-40 items-center justify-center">
      <LoaderCircle className="size-7 animate-spin text-[#4B2C70]" />
    </div>
  );
}

function ErrorText({ text }: { text: string }) {
  return (
    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
      {text}
    </p>
  );
}

const selectClasses =
  "h-10 w-full rounded-lg border border-input bg-white px-3 text-sm";
