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
  GripVertical,
  LoaderCircle,
  Pause,
  Play,
  Plus,
  Search,
  ShieldAlert,
} from "lucide-react";

import { TicketDetailDialog } from "@/components/ticket-detail-dialog";
import {
  Kanban,
  KanbanBoard,
  KanbanColumn,
  KanbanColumnContent,
  KanbanItem,
  KanbanItemHandle,
  KanbanOverlay,
} from "@/components/reui/kanban";
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
import { departments } from "@/lib/departments";
import { DateTimePicker } from "@/components/date-time-picker";
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
  department: string | null;
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
  department: string | null;
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
  departments: string[];
};

type JobCardForm = {
  primaryTicketId: string;
  relatedTicketIds: string[];
  title: string;
  description: string;
  assignedTo: string;
  categoryId: string;
  department: string;
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
  const [pendingTransition, setPendingTransition] = useState<{ cardId: string; status: KanbanStatus } | null>(null);
  const [transitionNote, setTransitionNote] = useState("");
  const [transitionSaving, setTransitionSaving] = useState(false);
  const [movingCardIds, setMovingCardIds] = useState<string[]>([]);
  const [moveMessage, setMoveMessage] = useState("");
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
  const boardColumns = useMemo(
    () =>
      Object.fromEntries(
        kanbanColumns.map(({ status: columnStatus }) => [
          columnStatus,
          cards.filter((card) => card.status === columnStatus),
        ]),
      ) as Record<KanbanStatus, JobCard[]>,
    [cards],
  );
  const overdue = cards.filter(
    (card) =>
      card.targetAt &&
      new Date(card.targetAt).getTime() < now &&
      !["COMPLETED", "CANCELLED"].includes(card.status),
  ).length;
  const liveCards = cards.filter((card) => card.status === "LIVE");
  const transitionCard = cards.find((card) => card.id === pendingTransition?.cardId) ?? null;

  async function moveCard(card: JobCard, targetStatus: KanbanStatus, note?: string) {
    const trimmedNote = note?.trim() ?? "";
    const action = targetStatus === "LIVE"
      ? (card.status === "SCHEDULED" ? "timer/start" : "timer/resume")
      : targetStatus === "PAUSED" ? "timer/pause"
      : targetStatus === "COMPLETED" ? "complete"
      : targetStatus === "ESCALATED" ? "escalate"
      : "end";
    const body = targetStatus === "COMPLETED" ? { completionNote: trimmedNote }
      : targetStatus === "ESCALATED" ? { reason: trimmedNote }
      : targetStatus === "CANCELLED" ? { endNote: trimmedNote }
      : undefined;

    setMovingCardIds((current) => current.includes(card.id) ? current : [...current, card.id]);
    setMoveMessage("");
    setCards((current) => current.map((item) => item.id === card.id ? { ...item, status: targetStatus } : item));
    try {
      await api("/api/job-cards/" + card.id + "/" + action, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
      });
      setMoveMessage(card.jobNumber + " moved to " + labelForStatus(targetStatus) + ".");
      await load();
      return true;
    } catch (caught) {
      setCards((current) => current.map((item) => item.id === card.id ? { ...item, status: card.status } : item));
      setMoveMessage(caught instanceof Error ? caught.message : "Could not update the job card status.");
      await load();
      return false;
    } finally {
      setMovingCardIds((current) => current.filter((id) => id !== card.id));
    }
  }

  function handleCardDrop(cardId: string, target: unknown) {
    const card = cards.find((item) => item.id === cardId);
    if (!card || !isKanbanStatus(target)) return;
    if (target === card.status) return;
    if (!canMoveCardTo(card, target)) {
      setMoveMessage(blockedMoveMessage(card, target));
      return;
    }
    if (needsTransitionNote(target)) {
      setPendingTransition({ cardId: card.id, status: target });
      setTransitionNote("");
      return;
    }
    void moveCard(card, target);
  }

  async function submitTransition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pendingTransition || !transitionCard) return;
    const note = transitionNote.trim();
    if (note.length < 5) {
      setMoveMessage("Enter at least 5 characters to continue.");
      return;
    }
    setTransitionSaving(true);
    if (await moveCard(transitionCard, pendingTransition.status, note)) {
      setPendingTransition(null);
      setTransitionNote("");
    }
    setTransitionSaving(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-2">
        {user.role !== "TECHNICIAN" && <h1 className="text-2xl font-semibold tracking-tight">Technician job cards</h1>}
        <div className="flex items-center gap-3">
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

      {!loading && !error && cards.length === 0 && (
        <Card className="border-dashed border-slate-300">
          <CardContent className="py-8 text-center">
            <h2 className="font-semibold">No job cards yet</h2>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">
              Tickets are available when you create a job card. Choose “Create job card” to link an existing ticket, or create a walk-in job.
            </p>
          </CardContent>
        </Card>
      )}

      {liveCards.length > 0 && (
        <section className="space-y-3" aria-label="Jobs in progress">
          <h2 className="text-lg font-semibold">In progress</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {liveCards.map((live) => (
              <Card key={live.id} className="overflow-hidden border-purple-200">
                <div className="bg-[#4B2C70] p-4 text-white">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Badge className={badgePalette.progress}>LIVE</Badge>
                      <p className="mt-3 text-sm text-purple-200">
                        {live.jobNumber} · {live.category.toUpperCase()}
                      </p>
                      <h3 className="mt-1 truncate text-lg font-semibold">{live.title}</h3>
                      <p className="mt-2 truncate text-sm text-purple-100">
                        {live.ticketNumber
                          ? `Ticket: ${live.ticketNumber} — ${live.ticketTitle}`
                          : `Walk-in job · ${live.reporterName}`}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs text-purple-200">Time on job</p>
                      <p className="font-mono text-2xl font-semibold">
                        {formatDuration(elapsed(live, now))}
                      </p>
                    </div>
                  </div>
                </div>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <p className="text-sm">
                    <strong>{live.technicianName}</strong>
                    {live.location && ` · ${live.location}`}
                  </p>
                  <Button size="sm" onClick={() => setSelected(live.id)}>Open job card</Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
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
            <>
              <Kanban
                value={boardColumns}
                onValueChange={(next) => setCards(Object.values(next).flat())}
                onMove={(event) =>
                  handleCardDrop(String(event.event.active.id), event.overContainer)
                }
                onDragStart={() => setMoveMessage("")}
                getItemValue={(card) => card.id}
                restoreOnCancel
              >
                <KanbanBoard className="grid min-w-0 grid-cols-1 gap-4 pb-3 sm:grid-cols-2 xl:grid-cols-3">
                  {kanbanColumns.map((column) => (
                    <KanbanColumnView
                      key={column.status}
                      column={column}
                      cards={boardColumns[column.status]}
                      movingCardIds={movingCardIds}
                      now={now}
                      onOpen={setSelected}
                    />
                  ))}
                </KanbanBoard>
                <KanbanOverlay className="pointer-events-none z-40">
                  {({ value, variant }) => {
                    if (variant !== "item") return null;
                    const card = cards.find((item) => item.id === String(value));
                    return card ? (
                      <div className="rotate-1 rounded-xl shadow-2xl">
                        <JobCardFace card={card} now={now} />
                      </div>
                    ) : null;
                  }}
                </KanbanOverlay>
              </Kanban>
            {moveMessage && <p className="mt-3 text-sm text-[#4B2C70]" role="status" aria-live="polite">{moveMessage}</p>}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={pendingTransition !== null} onOpenChange={(open) => { if (!open && !transitionSaving) { setPendingTransition(null); setTransitionNote(""); } }}>
        <DialogContent>
          <form onSubmit={submitTransition} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Move job card to {pendingTransition ? labelForStatus(pendingTransition.status) : "new status"}</DialogTitle>
              <DialogDescription>
                {transitionCard ? transitionCard.jobNumber + "  -  " + transitionCard.title : "Add a note to record this status change."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="kanban-transition-note">{noteLabelForStatus(pendingTransition?.status)}</Label>
              <Textarea
                id="kanban-transition-note"
                value={transitionNote}
                onChange={(event) => setTransitionNote(event.target.value)}
                minLength={5}
                maxLength={2000}
                required
                autoFocus
                placeholder="Add at least 5 characters"
              />
            </div>
            {moveMessage && <ErrorText text={moveMessage} />}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={transitionSaving} onClick={() => { setPendingTransition(null); setTransitionNote(""); }}>Cancel</Button>
              <Button type="submit" disabled={transitionSaving || transitionNote.trim().length < 5} className="bg-[#4B2C70] text-white hover:bg-[#3d235d]">
                {transitionSaving ? <LoaderCircle className="animate-spin" /> : null}
                {transitionSaving ? "Updating..." : "Update status"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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

type KanbanStatus = (typeof kanbanColumns)[number]["status"];

function isKanbanStatus(value: unknown): value is KanbanStatus {
  return kanbanColumns.some((column) => column.status === value);
}

function labelForStatus(status: KanbanStatus) {
  return kanbanColumns.find((column) => column.status === status)?.label ?? formatValue(status);
}

function noteLabelForStatus(status: KanbanStatus | undefined) {
  if (status === "COMPLETED") return "Completion note";
  if (status === "ESCALATED") return "Escalation reason";
  return "Cancellation reason";
}

function needsTransitionNote(status: KanbanStatus) {
  return status === "COMPLETED" || status === "ESCALATED" || status === "CANCELLED";
}

function canMoveCardTo(card: JobCard, target: KanbanStatus) {
  if (target === "LIVE") return card.status === "SCHEDULED" || card.status === "PAUSED";
  if (target === "PAUSED") return card.status === "LIVE";
  if (target === "COMPLETED") return !["COMPLETED", "CANCELLED"].includes(card.status);
  if (target === "ESCALATED") return card.isWalkIn && ["SCHEDULED", "LIVE", "PAUSED"].includes(card.status);
  if (target === "CANCELLED") return card.isWalkIn && !["COMPLETED", "CANCELLED"].includes(card.status);
  return false;
}

function blockedMoveMessage(card: JobCard, target: KanbanStatus) {
  if (!card.isWalkIn && (target === "ESCALATED" || target === "CANCELLED")) {
    return "Linked ticket job cards must use the ticket workflow for escalation or cancellation.";
  }
  return "That status change is unavailable from " + labelForStatus(isKanbanStatus(card.status) ? card.status : "SCHEDULED") + ". Use the job card actions to make a supported change.";
}

function KanbanColumnView({
  column,
  cards,
  movingCardIds,
  now,
  onOpen,
}: {
  column: (typeof kanbanColumns)[number];
  cards: JobCard[];
  movingCardIds: string[];
  now: number;
  onOpen: (id: string) => void;
}) {
  return (
    <KanbanColumn
      value={column.status}
      className={"min-h-80 overflow-hidden rounded-2xl border " + column.className}
      role="group"
      aria-label={column.label + " job cards"}
    >
      <header className="flex items-start justify-between gap-3 border-b p-4">
        <div>
          <h3 className="font-semibold">{column.label}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{column.helper}</p>
        </div>
        <Badge className={column.badgeClass}>{cards.length}</Badge>
      </header>
      <KanbanColumnContent
        value={column.status}
        className="min-h-56 flex-1 gap-3 p-3"
      >
        {cards.map((card) => (
          <DraggableJobCard
            key={card.id}
            card={card}
            now={now}
            disabled={movingCardIds.includes(card.id)}
            onOpen={onOpen}
          />
        ))}
        {cards.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white/60 p-4 text-center text-xs text-muted-foreground">
            Drop a job card here
          </div>
        )}
      </KanbanColumnContent>
    </KanbanColumn>
  );
}

function DraggableJobCard({
  card,
  now,
  disabled,
  onOpen,
}: {
  card: JobCard;
  now: number;
  disabled: boolean;
  onOpen: (id: string) => void;
}) {
  return (
    <KanbanItem
      value={card.id}
      disabled={disabled}
      className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[#4B2C70]/60"
      aria-label={card.jobNumber + ": " + card.title + ". " + formatValue(card.status) + ". Drag to update status or activate to open details."}
    >
      <KanbanItemHandle className="block">
        <button
          type="button"
          onClick={() => onOpen(card.id)}
          className="block w-full cursor-grab rounded-xl text-left active:cursor-grabbing"
          aria-label={"Open " + card.jobNumber + ": " + card.title}
        >
          <JobCardFace card={card} now={now} />
        </button>
      </KanbanItemHandle>
    </KanbanItem>
  );
}

function JobCardFace({ card, now }: { card: JobCard; now: number }) {
  return (
    <div className="w-full rounded-xl border bg-white p-4 text-left transition hover:border-[#4B2C70] hover:shadow-sm">
      <div className="flex justify-between gap-2">
        <Status status={card.status} />
        <Priority value={card.priority} />
      </div>
      <p className="mt-3 flex items-center gap-1 text-xs font-semibold text-[#4B2C70]">
        <GripVertical className="size-3.5 shrink-0 text-[#4B2C70]/60" aria-hidden="true" />
        {card.jobNumber}  -  {card.category.toUpperCase()}
      </p>
      <h3 className="mt-1 font-semibold">{card.title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        {card.ticketNumber ? card.ticketNumber + "  -  " + card.reporterName : "Walk-in  -  " + card.reporterName}
      </p>
      <p className="mt-2 text-sm font-medium">{card.department ?? "Department not set"}</p>
      <p className="mt-3 text-sm">{card.technicianName}</p>
      <div className="mt-3 flex justify-between text-xs text-muted-foreground">
        <span>{card.location ?? "No location"}</span>
        <span className="font-mono">{formatDuration(elapsed(card, now))}</span>
      </div>
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
    department: "",
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

function validateCreateJobCardForm(
  form: JobCardForm,
  options: JobCardOptions,
) {
  const issues: Array<{ label: string; fieldId: string }> = [];
  const addIssue = (label: string, fieldId: string) =>
    issues.push({ label, fieldId });
  const title = form.title.trim();
  const description = form.description.trim();
  const requesterName = form.walkInReporterName.trim();
  const requesterEmail = form.walkInReporterEmail.trim();

  if (!title) addIssue("job title", "job-card-title");
  else if (title.length < 5 || title.length > 160) {
    addIssue("job title (5–160 characters)", "job-card-title");
  }
  if (!options.technicians.some((item) => String(item.id) === form.assignedTo)) {
    addIssue("assigned technician", "job-card-technician");
  }
  if (!options.categories.some((item) => String(item.id) === form.categoryId)) {
    addIssue("category", "job-card-category");
  }
  if (form.department && !options.departments.includes(form.department)) {
    addIssue("department", "job-card-department");
  }
  if (!description) addIssue("work description", "job-card-description");
  else if (description.length < 10 || description.length > 4000) {
    addIssue("work description (10–4,000 characters)", "job-card-description");
  }

  if (!form.primaryTicketId) {
    if (!requesterName) addIssue("walk-in requester name", "walk-in-requester-name");
    else if (requesterName.length < 2 || requesterName.length > 120) {
      addIssue("requester name (2–120 characters)", "walk-in-requester-name");
    }
    if (
      requesterEmail &&
      (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requesterEmail) ||
        !requesterEmail.toLowerCase().endsWith("@mynwu.ac.za") ||
        requesterEmail.length > 255)
    ) {
      addIssue("requester email (valid @mynwu.ac.za address)", "walk-in-requester-email");
    }
  }

  if (form.locationDetails.trim().length > 200) {
    addIssue("location details (up to 200 characters)", "job-card-location-details");
  }
  if (form.stationReference.trim().length > 80) {
    addIssue("station or asset (up to 80 characters)", "job-card-station-reference");
  }
  if (form.internalNotes.trim().length > 4000) {
    addIssue("internal notes (up to 4,000 characters)", "job-card-internal-notes");
  }
  if (form.relatedTicketIds.length > 20) {
    addIssue("related tickets (up to 20)", "job-card-related-tickets");
  }
  const checklistItems = form.checklist.split("\n").map((item) => item.trim()).filter(Boolean);
  if (checklistItems.length > 30 || checklistItems.some((item) => item.length > 300)) {
    addIssue("checklist (up to 30 items, 300 characters each)", "job-card-checklist");
  }

  return issues;
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
    setError("");
  }

  function selectTicket(ticketId: string) {
    setError("");
    if (!ticketId) {
      setForm((current) => ({
        ...current,
        primaryTicketId: "",
        relatedTicketIds: [],
        title: "",
        description: "",
        categoryId: "",
        department: "",
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
      department: ticket.department ?? "",
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
    if (!options) {
      setError("Job-card options are still loading. Please try again in a moment.");
      return;
    }

    const issues = validateCreateJobCardForm(form, options);
    if (issues.length > 0) {
      setError(`Please complete or correct: ${issues.map((issue) => issue.label).join(", ")}.`);
      requestAnimationFrame(() => {
        document.getElementById(issues[0].fieldId)?.focus();
      });
      return;
    }

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
          department: form.department || null,
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
        <form noValidate onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Create job card</DialogTitle>
            <DialogDescription>
              Select a ticket to prefill its information, or leave it blank to
              capture a walk-in job manually.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <div className="mt-4">
              <ErrorText text={error} />
            </div>
          )}
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
                      id="walk-in-requester-name"
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
                      id="walk-in-requester-email"
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
                  id="job-card-title"
                  value={form.title}
                  onChange={(event) => update("title", event.target.value)}
                  minLength={5}
                  required
                />
              </Field>
              <Field label="Assigned technician">
                <select
                  id="job-card-technician"
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
                    id="job-card-related-tickets"
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
                  id="job-card-category"
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
              <Field label="Department">
                <select
                  id="job-card-department"
                  className={selectClasses}
                  value={form.department}
                  onChange={(event) => update("department", event.target.value)}
                >
                  <option value="">Select department</option>
                  {(options.departments ?? departments).map((department) => (
                    <option key={department} value={department}>
                      {department}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Building, room, or area">
                <Input
                  id="job-card-location-details"
                  value={form.locationDetails}
                  onChange={(event) => update("locationDetails", event.target.value)}
                />
              </Field>
              <Field label="Station or asset">
                <Input
                  id="job-card-station-reference"
                  value={form.stationReference}
                  onChange={(event) =>
                    update("stationReference", event.target.value)
                  }
                />
              </Field>
              <Field label="Scheduled date/time">
                <DateTimePicker
                  label="Scheduled date/time"
                  value={form.scheduledAt}
                  onChange={(value) => update("scheduledAt", value)}
                />
              </Field>
              <Field label="Target completion">
                <DateTimePicker
                  label="Target completion"
                  value={form.targetAt}
                  onChange={(value) => update("targetAt", value)}
                />
              </Field>
              <Field label="Work description" span>
                <Textarea
                  id="job-card-description"
                  value={form.description}
                  onChange={(event) => update("description", event.target.value)}
                  minLength={10}
                  required
                />
              </Field>
              <Field label="Initial checklist items (one per line)" span>
                <Textarea
                  id="job-card-checklist"
                  value={form.checklist}
                  onChange={(event) => update("checklist", event.target.value)}
                />
              </Field>
              <Field label="Internal notes" span>
                <Textarea
                  id="job-card-internal-notes"
                  value={form.internalNotes}
                  onChange={(event) => update("internalNotes", event.target.value)}
                />
              </Field>
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
            <Button type="submit" disabled={saving || !options}>
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
                    <strong>Department:</strong> {card.department ?? "—"}
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
