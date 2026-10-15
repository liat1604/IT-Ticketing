import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowLeft,
  Clock3,
  GitBranch,
  History,
  LoaderCircle,
  LockKeyhole,
  MessageSquare,
  Plus,
  Send,
  ShieldAlert,
  UserRound,
} from "lucide-react";

import { api, formatDuration, formatValue } from "@/lib/api";
import type { UserRole } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DateTimePicker } from "@/components/date-time-picker";

type TicketDetailResponse = {
  ticket: {
    id: string;
    ticketNumber: string;
    title: string;
    description: string;
    category: string;
    priority: string;
    status: string;
    source: string;
    department: string | null;
    locationDetails: string | null;
    stationReference: string | null;
    resolutionSummary: string | null;
    resolvedAt: string | null;
    parentTicketId: string | null;
    parentTicketNumber: string | null;
    parentTicketTitle: string | null;
    dueAt: string | null;
    createdAt: string;
    reporterName: string;
    reporterEmail: string;
    technicianName: string | null;
  };
  comments: Array<{
    id: string;
    body: string;
    visibility: "PUBLIC" | "INTERNAL";
    createdAt: string;
    authorName: string;
    authorRole: string;
  }>;
  timeEntries: Array<{
    id: string;
    startedAt: string;
    stoppedAt: string | null;
    durationSeconds: number;
    technicianName: string;
  }>;
  escalations: Array<{
    id: string;
    reason: string;
    externalReference: string | null;
    escalatedAt: string;
    escalatedBy: string;
  }>;
  auditEvents: Array<{
    id: number;
    action: string;
    newValues: Record<string, unknown> | null;
    createdAt: string;
    actorName: string | null;
  }>;
  subIssues: Array<{
    id: string;
    ticketNumber: string;
    title: string;
    description: string;
    category: string;
    priority: string;
    status: string;
    dueAt: string | null;
    createdAt: string;
    technicianName: string | null;
    recordedSeconds: number;
  }>;
};

type SubIssueOptions = {
  categories: Array<{ id: number; name: string }>;
  technicians: Array<{ id: string; fullName: string; role: string }>;
};

type TicketDetailDialogProps = {
  ticketId: string | null;
  open: boolean;
  role: UserRole;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void | Promise<void>;
};

export function TicketDetailDialog({
  ticketId,
  open,
  role,
  onOpenChange,
  onChanged,
}: TicketDetailDialogProps) {
  const [detail, setDetail] = useState<TicketDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [internal, setInternal] = useState(false);
  const [activeTicketId, setActiveTicketId] = useState<string | null>(ticketId);
  const [showSubIssueForm, setShowSubIssueForm] = useState(false);
  const [subIssueOptions, setSubIssueOptions] = useState<SubIssueOptions | null>(null);
  const [creatingSubIssue, setCreatingSubIssue] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!activeTicketId) return;

    setLoading(true);
    setError("");

    try {
      const result = await api<TicketDetailResponse>(`/api/portal/tickets/${activeTicketId}`);
      setDetail(result);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not load ticket");
    } finally {
      setLoading(false);
    }
  }, [activeTicketId]);

  useEffect(() => {
    if (open) {
      setActiveTicketId(ticketId);
      setShowSubIssueForm(false);
    }
  }, [open, ticketId]);

  useEffect(() => {
    if (open) void loadDetail();
  }, [loadDetail, open]);

  async function sendComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeTicketId) return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    const body = String(formData.get("comment") ?? "").trim();

    if (!body) return;

    setSending(true);
    setError("");

    try {
      await api(`/api/portal/tickets/${activeTicketId}/comments`, {
        method: "POST",
        body: JSON.stringify({
          body,
          visibility: internal ? "INTERNAL" : "PUBLIC",
        }),
      });
      form.reset();
      setInternal(false);
      await loadDetail();
      await onChanged?.();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not add comment");
    } finally {
      setSending(false);
    }
  }

  async function beginSubIssue() {
    setError("");
    try {
      if (!subIssueOptions) {
        setSubIssueOptions(await api<SubIssueOptions>("/api/portal/sub-issue-options"));
      }
      setShowSubIssueForm(true);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not load sub-issue options");
    }
  }

  async function createSubIssue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeTicketId) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setCreatingSubIssue(true);
    setError("");
    try {
      await api(`/api/portal/tickets/${activeTicketId}/sub-issues`, {
        method: "POST",
        body: JSON.stringify({
          title: data.get("title"),
          description: data.get("description"),
          categoryId: Number(data.get("categoryId")),
          priority: data.get("priority"),
          assignedTo: data.get("assignedTo") || null,
          dueAt: data.get("dueAt") ? new Date(String(data.get("dueAt"))).toISOString() : null,
        }),
      });
      form.reset();
      setShowSubIssueForm(false);
      await loadDetail();
      await onChanged?.();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not create sub-issue");
    } finally {
      setCreatingSubIssue(false);
    }
  }

  const isStaff = role !== "REPORTER";
  const isResolved = detail?.ticket.status === "RESOLVED";
  const totalSeconds = detail?.timeEntries.reduce(
    (total, entry) => total + Number(entry.durationSeconds),
    0,
  ) ?? 0;
  const subIssueSeconds = detail?.subIssues.reduce(
    (total, subIssue) => total + Number(subIssue.recordedSeconds),
    0,
  ) ?? 0;
  const resolvedSubIssues = detail?.subIssues.filter((subIssue) => subIssue.status === "RESOLVED").length ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          {detail?.ticket.parentTicketId && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mb-1 w-fit px-0 text-[#4B2C70]"
              onClick={() => setActiveTicketId(detail.ticket.parentTicketId)}
            >
              <ArrowLeft /> Back to {detail.ticket.parentTicketNumber}
            </Button>
          )}
          <DialogTitle>
            {detail ? `${detail.ticket.ticketNumber} · ${detail.ticket.title}` : "Ticket detail"}
          </DialogTitle>
          <DialogDescription>
            Complete ticket history, communication, time entries, and escalation records.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex min-h-72 items-center justify-center">
            <LoaderCircle className="size-7 animate-spin text-[#4B2C70]" />
          </div>
        ) : error && !detail ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : detail ? (
          <div className="space-y-6">
            <section className="rounded-xl border bg-slate-50 p-4">
              <div className="flex flex-wrap gap-2">
                <PriorityBadge priority={detail.ticket.priority} />
                <Badge variant="secondary">{formatValue(detail.ticket.status)}</Badge>
                <Badge variant="outline">{detail.ticket.category}</Badge>
                {detail.ticket.source === "WALK_IN" && <Badge variant="outline">Walk-in</Badge>}
                {detail.ticket.parentTicketNumber && <Badge className="bg-purple-100 text-[#4B2C70]">Sub-issue of {detail.ticket.parentTicketNumber}</Badge>}
              </div>

              <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                {detail.ticket.description}
              </p>

              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reporter</dt>
                  <dd className="mt-1">{detail.ticket.reporterName} · {detail.ticket.reporterEmail}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Assigned technician</dt>
                  <dd className="mt-1">{detail.ticket.technicianName ?? "Not assigned"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Department</dt>
                  <dd className="mt-1">{detail.ticket.department ?? "Not specified"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Location</dt>
                  <dd className="mt-1">
                    {[detail.ticket.locationDetails, detail.ticket.stationReference].filter(Boolean).join(" · ") || "Not provided"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recorded work</dt>
                  <dd className="mt-1 font-mono">{formatDuration(totalSeconds + subIssueSeconds)}</dd>
                </div>
                {detail.ticket.dueAt && <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Target date</dt><dd className="mt-1">{new Date(detail.ticket.dueAt).toLocaleString()}</dd></div>}
              </dl>

              {detail.ticket.resolutionSummary && (
                <div className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
                  <strong>Resolution:</strong> {detail.ticket.resolutionSummary}
                </div>
              )}
            </section>

            {!detail.ticket.parentTicketId && (
              <section>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="flex items-center gap-2 font-semibold"><GitBranch className="size-4 text-[#4B2C70]" /> Sub-issues</h3>
                    <p className="mt-1 text-xs text-muted-foreground">Independent work items roll up into the original ticket without resetting its age.</p>
                  </div>
                  {isStaff && !isResolved && !showSubIssueForm && (
                    <Button type="button" size="sm" variant="outline" onClick={() => void beginSubIssue()}><Plus /> Add sub-issue</Button>
                  )}
                </div>

                {detail.subIssues.length > 0 && (
                  <div className="mt-4 rounded-xl border bg-slate-50 p-4">
                    <div className="flex items-center justify-between text-sm"><span className="font-medium">{resolvedSubIssues} of {detail.subIssues.length} resolved</span><span className="font-mono text-muted-foreground">{formatDuration(subIssueSeconds)} child work</span></div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-[#4B2C70] transition-all" style={{ width: `${detail.subIssues.length === 0 ? 0 : (resolvedSubIssues / detail.subIssues.length) * 100}%` }} /></div>
                  </div>
                )}

                {showSubIssueForm && subIssueOptions && (
                  <form className="mt-4 rounded-xl border border-purple-100 bg-purple-50/40 p-4" onSubmit={createSubIssue}>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Short title" span><Input name="title" minLength={5} maxLength={160} required /></Field>
                      <Field label="Description" span><Textarea name="description" className="min-h-24" minLength={10} maxLength={4000} required /></Field>
                      <Field label="Category"><select name="categoryId" className={selectClasses} defaultValue={subIssueOptions.categories.find((category) => category.name === detail.ticket.category)?.id}>{subIssueOptions.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></Field>
                      <Field label="Priority"><select name="priority" className={selectClasses} defaultValue={detail.ticket.priority}><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="CRITICAL">Critical</option></select></Field>
                      <Field label="Assign technician"><select name="assignedTo" className={selectClasses}><option value="">Leave unassigned</option>{subIssueOptions.technicians.map((technician) => <option key={technician.id} value={technician.id}>{technician.fullName}</option>)}</select></Field>
                      <Field label="Target date"><DateTimePicker label="Target date and time" name="dueAt" /></Field>
                    </div>
                    <div className="mt-4 flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setShowSubIssueForm(false)} disabled={creatingSubIssue}>Cancel</Button><Button type="submit" className="bg-[#4B2C70] text-white" disabled={creatingSubIssue}>{creatingSubIssue ? <LoaderCircle className="animate-spin" /> : <GitBranch />}{creatingSubIssue ? "Creating..." : "Create sub-issue"}</Button></div>
                  </form>
                )}

                <div className="mt-4 space-y-2">
                  {detail.subIssues.length === 0 ? <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">No sub-issues have been added.</p> : detail.subIssues.map((subIssue) => (
                    <button key={subIssue.id} type="button" onClick={() => { setActiveTicketId(subIssue.id); setShowSubIssueForm(false); }} className="flex w-full flex-col gap-3 rounded-xl border bg-white p-4 text-left transition hover:border-purple-200 hover:bg-purple-50/30 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0"><p className="text-xs font-semibold text-[#4B2C70]">{subIssue.ticketNumber}</p><p className="truncate font-medium">{subIssue.title}</p><p className="mt-1 text-xs text-muted-foreground">{subIssue.technicianName ?? "Unassigned"}{subIssue.dueAt ? ` · Due ${new Date(subIssue.dueAt).toLocaleDateString()}` : ""} · {formatDuration(subIssue.recordedSeconds)}</p></div>
                      <div className="flex shrink-0 gap-2"><PriorityBadge priority={subIssue.priority} /><Badge variant="secondary">{formatValue(subIssue.status)}</Badge></div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {detail.escalations.length > 0 && (
              <section>
                <h3 className="flex items-center gap-2 font-semibold">
                  <ShieldAlert className="size-4 text-red-700" />
                  NWU Central IT escalation
                </h3>
                <div className="mt-3 space-y-2">
                  {detail.escalations.map((escalation) => (
                    <div key={escalation.id} className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm">
                      <p>{escalation.reason}</p>
                      <p className="mt-2 text-xs text-red-800">
                        {escalation.escalatedBy} · {new Date(escalation.escalatedAt).toLocaleString()}
                        {escalation.externalReference ? ` · Ref ${escalation.externalReference}` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section>
              <h3 className="flex items-center gap-2 font-semibold">
                <MessageSquare className="size-4 text-[#4B2C70]" />
                Conversation
              </h3>

              <div className="mt-3 space-y-3">
                {detail.comments.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                    No comments have been added yet.
                  </p>
                ) : (
                  detail.comments.map((comment) => (
                    <article
                      key={comment.id}
                      className={
                        comment.visibility === "INTERNAL"
                          ? "rounded-xl border border-amber-200 bg-amber-50 p-4"
                          : "rounded-xl border bg-white p-4"
                      }
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="flex items-center gap-2 text-sm font-medium">
                          {comment.visibility === "INTERNAL" ? <LockKeyhole className="size-4" /> : <UserRound className="size-4" />}
                          {comment.authorName}
                        </p>
                        <time className="text-xs text-muted-foreground" dateTime={comment.createdAt}>
                          {new Date(comment.createdAt).toLocaleString()}
                        </time>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{comment.body}</p>
                      {comment.visibility === "INTERNAL" && (
                        <Badge className="mt-3 bg-amber-100 text-amber-900">Internal note</Badge>
                      )}
                    </article>
                  ))
                )}
              </div>

              {!isResolved && (
                <form className="mt-4 space-y-3" onSubmit={sendComment}>
                  <Textarea
                    name="comment"
                    className="min-h-24"
                    placeholder={isStaff ? "Add a public update or an internal technician note..." : "Reply to the support team..."}
                    maxLength={4000}
                    required
                  />
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    {isStaff ? (
                      <label className="flex items-center gap-2 text-sm text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={internal}
                          onChange={(event) => setInternal(event.target.checked)}
                        />
                        Internal technician note
                      </label>
                    ) : (
                      <span className="text-xs text-muted-foreground">Your reply is visible to the assigned support team.</span>
                    )}
                    <Button type="submit" disabled={sending} className="bg-[#4B2C70] text-white hover:bg-[#3d235d]">
                      {sending ? <LoaderCircle className="animate-spin" /> : <Send />}
                      {sending ? "Sending..." : "Send update"}
                    </Button>
                  </div>
                </form>
              )}
            </section>

            {isStaff && (
              <section>
                <h3 className="flex items-center gap-2 font-semibold">
                  <Clock3 className="size-4 text-[#4B2C70]" />
                  Time entries
                </h3>
                <div className="mt-3 space-y-2">
                  {detail.timeEntries.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No time has been recorded.</p>
                  ) : (
                    detail.timeEntries.map((entry) => (
                      <div key={entry.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                        <span>{entry.technicianName} · {new Date(entry.startedAt).toLocaleString()}</span>
                        <span className="font-mono">{formatDuration(entry.durationSeconds)}</span>
                      </div>
                    ))
                  )}
                </div>
              </section>
            )}

            <section>
              <h3 className="flex items-center gap-2 font-semibold">
                <History className="size-4 text-[#4B2C70]" />
                Immutable activity
              </h3>
              <div className="mt-3 space-y-2 border-l-2 border-purple-100 pl-4">
                {detail.auditEvents.map((event) => (
                  <div key={event.id} className="text-sm">
                    <p className="font-medium">{formatValue(event.action)}</p>
                    <p className="text-xs text-muted-foreground">
                      {event.actorName ?? "System"} · {new Date(event.createdAt).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                {error}
              </p>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const className = priority === "CRITICAL"
    ? "bg-red-100 text-red-800"
    : priority === "HIGH"
      ? "bg-orange-100 text-orange-800"
      : priority === "MEDIUM"
        ? "bg-violet-100 text-violet-800"
        : "bg-slate-100 text-slate-700";

  return <Badge className={className}>{formatValue(priority)}</Badge>;
}

function Field({ label, span = false, children }: { label: string; span?: boolean; children: ReactNode }) {
  return <div className={span ? "space-y-2 sm:col-span-2" : "space-y-2"}><Label>{label}</Label>{children}</div>;
}

const selectClasses = "h-10 w-full rounded-lg border border-input bg-white px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50";
