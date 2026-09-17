import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Activity, AlertTriangle, BarChart3, CalendarRange, DatabaseBackup, Download, Eye, GitBranch, LoaderCircle, Plus, RefreshCw, Search, ShieldCheck, TicketCheck, Timer, UserCog } from "lucide-react";

import { api, formatDuration, formatValue, relativeTime } from "@/lib/api";
import type { PortalSection, User, UserRole } from "@/types";
import { TicketDetailDialog } from "@/components/ticket-detail-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Overview = {
  periodDays: number;
  periodStart: string;
  periodEnd: string;
  metrics: { createdInPeriod: number; resolvedInPeriod: number; activeTickets: number; escalatedTickets: number; criticalTickets: number; unassignedTickets: number; overdueTargets: number; averageResolutionSeconds: number; medianResolutionSeconds: number; resolutionRate: number };
  byCategory: Array<{ name: string; value: number }>;
  byStatus: Array<{ name: string; value: number }>;
  technicianPerformance: Array<{ id: string; fullName: string; activeTickets: number; resolvedTickets: number; workSeconds: number; handledTickets: number; averageResolutionSeconds: number; manualTickets: number }>;
  resolutionByPriority: Array<{ name: string; resolvedTickets: number; averageResolutionSeconds: number; medianResolutionSeconds: number; withinTarget: number; targetSeconds: number }>;
  resolutionTimeline: Array<{ label: string; created: number; resolved: number }>;
  backlogAge: Array<{ name: string; value: number }>;
  sourceBreakdown: Array<{ name: string; value: number }>;
  subIssueSummary: { parentsWithSubIssues: number; totalSubIssues: number; resolvedSubIssues: number; overdueWorkItems: number };
  notifications: { pending: number; sent: number; failed: number };
};
type AdminTicket = { id: string; ticketNumber: string; title: string; priority: string; status: string; source: string; category: string; reporterName: string; reporterEmail: string; technicianName: string | null; parentTicketNumber: string | null; dueAt: string | null; createdAt: string };
type ManagedUser = User & { isActive: boolean; createdAt: string; reportedTickets: number; assignedTickets: number };
type AuditEvent = { id: number; action: string; createdAt: string; actorName: string | null; ticketNumber: string | null; previousValues: Record<string, unknown> | null; newValues: Record<string, unknown> | null };

export function AdminDashboard({ section, user }: { section: PortalSection; user: User }) {
  if (section === "tickets") return <TicketAdministration role={user.role} />;
  if (section === "users") return <UserAdministration currentUser={user} />;
  if (section === "audit") return <AuditLog />;
  if (section === "system") return <SystemAdministration role={user.role} />;
  return <ReportsOverview showReportHeading={section === "reports"} role={user.role} />;
}

function ReportsOverview({ showReportHeading, role }: { showReportHeading: boolean; role: UserRole }) {
  const [period, setPeriod] = useState("30");
  const [range, setRange] = useState(() => dateRangeFor(30));
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ from: range.from, to: range.to });
      setData(await api<Overview>(`/api/admin/overview?${params}`));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load reports");
    } finally {
      setLoading(false);
    }
  }, [range]);
  useEffect(() => { void load(); }, [load]);

  function selectPeriod(value: string) {
    setPeriod(value);
    if (value !== "custom") setRange(dateRangeFor(Number(value)));
  }

  function updateDate(key: "from" | "to", value: string) {
    setPeriod("custom");
    setRange((current) => ({ ...current, [key]: value }));
  }

  function reportUrl(path: string) {
    return `${path}?${new URLSearchParams({ from: range.from, to: range.to })}`;
  }

  if (loading && !data) return <LoadingPanel label="Loading operational reporting" />;
  const maximum = Math.max(1, ...(data?.byCategory.map((item) => item.value) ?? []));
  return <div className="space-y-6">
    <div><h1 className="text-2xl font-semibold tracking-tight">{showReportHeading ? "Reports and analytics" : "Operational overview"}</h1><p className="text-sm text-muted-foreground">Live service data from PostgreSQL—not demonstration values.</p></div>
    <Card>
      <CardContent className="grid gap-4 pt-6 xl:grid-cols-[190px_170px_170px_1fr] xl:items-end">
        <Field label="Period"><select value={period} onChange={(event) => selectPeriod(event.target.value)} className={`${selectClasses} w-full`}><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last year</option><option value="custom">Custom dates</option></select></Field>
        <Field label="From"><Input type="date" value={range.from} max={range.to} onChange={(event) => updateDate("from", event.target.value)} /></Field>
        <Field label="To"><Input type="date" value={range.to} min={range.from} max={todayDateInput()} onChange={(event) => updateDate("to", event.target.value)} /></Field>
        <div className="flex flex-wrap gap-2 xl:justify-end"><Button variant="outline" disabled={!data} onClick={() => data && downloadSummaryReport(data)}><Download /> Summary CSV</Button><Button variant="outline" disabled={!range.from || !range.to} onClick={() => download(reportUrl("/api/admin/reports/tickets.csv"))}><Download /> Ticket CSV</Button><Button variant="outline" disabled={!range.from || !range.to} onClick={() => download(reportUrl("/api/admin/reports/technicians.csv"))}><Download /> Technician CSV</Button><Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} /> Refresh</Button></div>
      </CardContent>
    </Card>
    {error && <ErrorMessage>{error}</ErrorMessage>}
    {data && <>
      <p className="flex items-center gap-2 text-sm text-muted-foreground"><CalendarRange className="size-4" /> Reporting on {formatReportDate(data.periodStart)} to {formatReportDate(data.periodEnd)} ({data.periodDays} days)</p>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Current active tickets" value={data.metrics.activeTickets} icon={<TicketCheck />} /><Metric label="Created in period" value={data.metrics.createdInPeriod} icon={<Plus />} /><Metric label="Resolved in period" value={data.metrics.resolvedInPeriod} icon={<ShieldCheck />} /><Metric label="Average resolution" value={formatDuration(data.metrics.averageResolutionSeconds)} icon={<Activity />} /></section>
      {showReportHeading && <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Median resolution" value={formatDuration(data.metrics.medianResolutionSeconds)} icon={<Timer />} /><Metric label="Resolution rate" value={`${data.metrics.resolutionRate}%`} icon={<BarChart3 />} /><Metric label="Unassigned tickets" value={data.metrics.unassignedTickets} icon={<AlertTriangle />} /><Metric label="Overdue targets" value={data.metrics.overdueTargets} icon={<CalendarRange />} /></section>}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card><CardHeader><CardTitle>Tickets by category</CardTitle><CardDescription>Requests created during the selected period</CardDescription></CardHeader><CardContent className="space-y-4">{data.byCategory.map((item) => <div key={item.name}><div className="mb-1 flex justify-between text-sm"><span>{item.name}</span><span className="font-semibold">{item.value}</span></div><div className="h-2.5 rounded-full bg-slate-100"><div className="h-2.5 rounded-full bg-[#4B2C70]" style={{ width: `${(item.value / maximum) * 100}%` }} /></div></div>)}</CardContent></Card>
        <Card><CardHeader><CardTitle>Status distribution</CardTitle><CardDescription>Current status of tickets created in the selected period</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">{data.byStatus.map((item) => <div key={item.name} className="rounded-xl border p-4"><p className="text-sm text-muted-foreground">{formatValue(item.name)}</p><p className="mt-1 text-2xl font-semibold">{item.value}</p></div>)}</CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle>Technician performance</CardTitle><CardDescription>Work handled during the selected period; active is the technician's current queue.</CardDescription></CardHeader><CardContent><ResponsiveTable headings={["Technician","Active","Handled","Resolved","Walk-ins","Recorded time","Avg. resolution"]}>{data.technicianPerformance.map((person) => <tr key={person.id} className="border-t"><td className="px-4 py-3 font-medium">{person.fullName}</td><td className="px-4 py-3">{person.activeTickets}</td><td className="px-4 py-3">{person.handledTickets}</td><td className="px-4 py-3">{person.resolvedTickets}</td><td className="px-4 py-3">{person.manualTickets}</td><td className="whitespace-nowrap px-4 py-3">{formatDuration(person.workSeconds)}</td><td className="whitespace-nowrap px-4 py-3">{person.resolvedTickets ? formatDuration(person.averageResolutionSeconds) : "—"}</td></tr>)}</ResponsiveTable></CardContent></Card>
      {showReportHeading && <ExtendedReports data={data} />}
      {role === "SYSTEM_ADMIN" && <Card><CardHeader><CardTitle>Notification outbox</CardTitle><CardDescription>Persistent email delivery queue health</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-3"><SmallStat label="Pending" value={data.notifications.pending} /><SmallStat label="Processed" value={data.notifications.sent} /><SmallStat label="Retry needed" value={data.notifications.failed} /></CardContent></Card>}
    </>}
  </div>;
}

function ExtendedReports({ data }: { data: Overview }) {
  const timelineMaximum = Math.max(1, ...data.resolutionTimeline.flatMap((item) => [item.created, item.resolved]));
  const backlogMaximum = Math.max(1, ...data.backlogAge.map((item) => item.value));
  const sourceMaximum = Math.max(1, ...data.sourceBreakdown.map((item) => item.value));
  const completedSubIssues = data.subIssueSummary.totalSubIssues === 0 ? 0 : Math.round((data.subIssueSummary.resolvedSubIssues / data.subIssueSummary.totalSubIssues) * 100);

  return <div className="space-y-6">
    <Card><CardHeader><CardTitle>Ticket flow over time</CardTitle><CardDescription>Created versus resolved tickets in each reporting bucket.</CardDescription></CardHeader><CardContent>{data.resolutionTimeline.length === 0 ? <EmptyReport /> : <div className="space-y-4">{data.resolutionTimeline.map((item) => <div key={item.label} className="grid gap-2 sm:grid-cols-[120px_1fr]"><p className="text-sm font-medium">{formatTimelineLabel(item.label, data.periodDays)}</p><div className="space-y-1.5"><ReportBar label="Created" value={item.created} maximum={timelineMaximum} className="bg-[#4B2C70]" /><ReportBar label="Resolved" value={item.resolved} maximum={timelineMaximum} className="bg-emerald-500" /></div></div>)}</div>}</CardContent></Card>
    <Card><CardHeader><CardTitle>Resolution time and service targets</CardTitle><CardDescription>Elapsed time from ticket creation to resolution, compared with operational priority targets.</CardDescription></CardHeader><CardContent>{data.resolutionByPriority.length === 0 ? <EmptyReport /> : <ResponsiveTable headings={["Priority","Target","Resolved","Average","Median","Within target"]}>{data.resolutionByPriority.map((item) => { const percentage = item.resolvedTickets === 0 ? 0 : Math.round((item.withinTarget / item.resolvedTickets) * 100); return <tr key={item.name} className="border-t"><td className="px-4 py-3"><Priority priority={item.name} /></td><td className="px-4 py-3">{formatDuration(item.targetSeconds)}</td><td className="px-4 py-3">{item.resolvedTickets}</td><td className="px-4 py-3">{formatDuration(item.averageResolutionSeconds)}</td><td className="px-4 py-3">{formatDuration(item.medianResolutionSeconds)}</td><td className="px-4 py-3"><span className={percentage >= 80 ? "text-emerald-700" : percentage >= 50 ? "text-amber-700" : "text-red-700"}>{item.withinTarget} ({percentage}%)</span></td></tr>; })}</ResponsiveTable>}</CardContent></Card>
    <div className="grid gap-6 xl:grid-cols-2">
      <Card><CardHeader><CardTitle>Current backlog age</CardTitle><CardDescription>Open tickets grouped by how long they have been waiting.</CardDescription></CardHeader><CardContent className="space-y-4">{data.backlogAge.length === 0 ? <EmptyReport /> : data.backlogAge.map((item) => <ReportBar key={item.name} label={item.name} value={item.value} maximum={backlogMaximum} className={item.name === "15+ days" ? "bg-red-500" : "bg-amber-500"} />)}</CardContent></Card>
      <Card><CardHeader><CardTitle>Ticket source</CardTitle><CardDescription>How tickets entered the system during this period.</CardDescription></CardHeader><CardContent className="space-y-4">{data.sourceBreakdown.length === 0 ? <EmptyReport /> : data.sourceBreakdown.map((item) => <ReportBar key={item.name} label={formatValue(item.name)} value={item.value} maximum={sourceMaximum} className="bg-sky-500" />)}</CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><GitBranch className="text-[#4B2C70]" /> Sub-issue delivery</CardTitle><CardDescription>Progress on larger tickets that were divided into technician work items.</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><SmallStat label="Parent tickets" value={data.subIssueSummary.parentsWithSubIssues} /><SmallStat label="Total sub-issues" value={data.subIssueSummary.totalSubIssues} /><SmallStat label={`Resolved (${completedSubIssues}%)`} value={data.subIssueSummary.resolvedSubIssues} /><SmallStat label="Overdue work items" value={data.subIssueSummary.overdueWorkItems} /></CardContent></Card>
    <Card><CardHeader><CardTitle>Operational attention</CardTitle><CardDescription>Current queue risks that may need administrator action.</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><SmallStat label="Escalated" value={data.metrics.escalatedTickets} /><SmallStat label="Critical open" value={data.metrics.criticalTickets} /><SmallStat label="Unassigned" value={data.metrics.unassignedTickets} /><SmallStat label="Overdue targets" value={data.metrics.overdueTargets} /></CardContent></Card>
  </div>;
}

function TicketAdministration({ role }: { role: UserRole }) {
  const [tickets, setTickets] = useState<AdminTicket[]>([]); const [search, setSearch] = useState(""); const [status, setStatus] = useState("ALL"); const [priority, setPriority] = useState("ALL"); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [selected, setSelected] = useState<string | null>(null);
  const load = useCallback(async () => { setLoading(true); setError(""); try { const params = new URLSearchParams({ search, status, priority }); setTickets((await api<{ tickets: AdminTicket[] }>(`/api/admin/tickets?${params}`)).tickets); } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load tickets"); } finally { setLoading(false); } }, [priority, search, status]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 200); return () => window.clearTimeout(timer); }, [load]);
  return <div className="space-y-6"><div><h1 className="text-2xl font-semibold tracking-tight">All tickets</h1><p className="text-sm text-muted-foreground">Search and review the full operational ticket register.</p></div>
    <Card><CardHeader><div className="grid gap-3 md:grid-cols-[1fr_190px_190px_auto]"><label className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Ticket, requester or email" /></label><Filter value={status} onChange={setStatus} values={["NEW","ASSIGNED","IN_PROGRESS","AWAITING_FEEDBACK","ESCALATED","RESOLVED"]} /><Filter value={priority} onChange={setPriority} values={["CRITICAL","HIGH","MEDIUM","LOW"]} /><Button variant="outline" onClick={() => void load()}><RefreshCw className={loading ? "animate-spin" : ""} /> Refresh</Button></div></CardHeader><CardContent>{error && <ErrorMessage>{error}</ErrorMessage>}{loading && tickets.length === 0 ? <LoadingPanel label="Loading tickets" /> : <ResponsiveTable headings={["Ticket","Requester","Category","Priority","Status","Assigned","Created",""]}>{tickets.map((ticket) => <tr key={ticket.id} className="border-t"><td className="px-4 py-3"><p className="font-semibold text-[#4B2C70]">{ticket.ticketNumber}</p><p className="max-w-56 truncate text-sm">{ticket.title}</p></td><td className="px-4 py-3"><p>{ticket.reporterName}</p><p className="text-xs text-muted-foreground">{ticket.reporterEmail}</p></td><td className="px-4 py-3">{ticket.category}</td><td className="px-4 py-3"><Priority priority={ticket.priority} /></td><td className="px-4 py-3"><Badge variant="secondary">{formatValue(ticket.status)}</Badge></td><td className="px-4 py-3">{ticket.technicianName ?? "Unassigned"}</td><td className="px-4 py-3 text-sm">{relativeTime(ticket.createdAt)}</td><td className="px-4 py-3"><Button size="icon" variant="ghost" aria-label={`View ${ticket.ticketNumber}`} onClick={() => setSelected(ticket.id)}><Eye /></Button></td></tr>)}</ResponsiveTable>}</CardContent></Card>
    <TicketDetailDialog ticketId={selected} open={selected !== null} role={role} onOpenChange={(open) => !open && setSelected(null)} onChanged={load} />
  </div>;
}

function UserAdministration({ currentUser }: { currentUser: User }) {
  const [users, setUsers] = useState<ManagedUser[]>([]); const [search, setSearch] = useState(""); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [message, setMessage] = useState(""); const [open, setOpen] = useState(false); const [saving, setSaving] = useState(false);
  const load = useCallback(async () => { setLoading(true); try { setUsers((await api<{ users: ManagedUser[] }>(`/api/admin/users?search=${encodeURIComponent(search)}`)).users); } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load users"); } finally { setLoading(false); } }, [search]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 200); return () => window.clearTimeout(timer); }, [load]);
  async function createUser(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setSaving(true); setError(""); const form = event.currentTarget; const data = new FormData(form); try { await api("/api/admin/users", { method: "POST", body: JSON.stringify({ fullName: data.get("fullName"), email: data.get("email"), password: data.get("password"), role: data.get("role") }) }); setOpen(false); form.reset(); setMessage("User account created successfully."); await load(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not create user"); } finally { setSaving(false); } }
  async function updateUser(user: ManagedUser, changes: { role?: UserRole; isActive?: boolean }) { setError(""); setMessage(""); try { await api(`/api/admin/users/${user.id}`, { method: "PATCH", body: JSON.stringify(changes) }); setMessage(`${user.fullName}'s account was updated.`); await load(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not update user"); } }
  return <div className="space-y-6"><div className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-2xl font-semibold tracking-tight">Users and permissions</h1><p className="text-sm text-muted-foreground">Create accounts, assign roles and control access.</p></div><Button className="bg-[#4B2C70] text-white" onClick={() => setOpen(true)}><Plus /> Create user</Button></div>
    {error && <ErrorMessage>{error}</ErrorMessage>}{message && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>}
    <Card><CardHeader><label className="relative max-w-md"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Search name or NWU email" /></label></CardHeader><CardContent>{loading && users.length === 0 ? <LoadingPanel label="Loading users" /> : <ResponsiveTable headings={["User","Role","Status","Ticket activity","Created",""]}>{users.map((managed) => { const systemRestricted = currentUser.role !== "SYSTEM_ADMIN" && managed.role === "SYSTEM_ADMIN"; return <tr key={managed.id} className="border-t"><td className="px-4 py-3"><p className="font-medium">{managed.fullName}</p><p className="text-xs text-muted-foreground">{managed.email}</p></td><td className="px-4 py-3"><select value={managed.role} disabled={systemRestricted} onChange={(event) => void updateUser(managed, { role: event.target.value as UserRole })} className={selectClasses}>{(["REPORTER","TECHNICIAN","ADMIN",...(currentUser.role === "SYSTEM_ADMIN" ? ["SYSTEM_ADMIN"] : [])] as UserRole[]).map((role) => <option key={role} value={role}>{formatValue(role)}</option>)}</select></td><td className="px-4 py-3"><Badge className={managed.isActive ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}>{managed.isActive ? "Active" : "Inactive"}</Badge></td><td className="px-4 py-3 text-sm">{managed.reportedTickets} reported · {managed.assignedTickets} assigned</td><td className="px-4 py-3 text-sm">{new Date(managed.createdAt).toLocaleDateString()}</td><td className="px-4 py-3"><Button size="sm" variant="outline" disabled={managed.id === currentUser.id || systemRestricted} onClick={() => void updateUser(managed, { isActive: !managed.isActive })}>{managed.isActive ? "Deactivate" : "Activate"}</Button></td></tr>; })}</ResponsiveTable>}</CardContent></Card>
    <Dialog open={open} onOpenChange={(next) => !saving && setOpen(next)}><DialogContent className="sm:max-w-lg"><form onSubmit={createUser}><DialogHeader><DialogTitle>Create user account</DialogTitle><DialogDescription>Provision secure access using an NWU email address.</DialogDescription></DialogHeader><div className="space-y-4 py-5"><Field label="Full name"><Input name="fullName" minLength={2} maxLength={120} required /></Field><Field label="NWU email"><Input name="email" type="email" placeholder="name@nwu.ac.za" required /></Field><Field label="Temporary password"><Input name="password" type="password" minLength={12} required /><p className="text-xs text-muted-foreground">At least 12 characters with uppercase, lowercase and a number.</p></Field><Field label="Role"><select name="role" className={selectClasses} defaultValue="REPORTER"><option value="REPORTER">Reporter</option><option value="TECHNICIAN">Technician</option><option value="ADMIN">Administrator</option>{currentUser.role === "SYSTEM_ADMIN" && <option value="SYSTEM_ADMIN">System administrator</option>}</select></Field></div><DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" className="bg-[#4B2C70] text-white" disabled={saving}>{saving ? <LoaderCircle className="animate-spin" /> : <UserCog />}{saving ? "Creating..." : "Create account"}</Button></DialogFooter></form></DialogContent></Dialog>
  </div>;
}

function AuditLog() {
  const [events, setEvents] = useState<AuditEvent[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const load = useCallback(async () => { setLoading(true); try { setEvents((await api<{ events: AuditEvent[] }>("/api/admin/audit?limit=250")).events); } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load audit log"); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  return <div className="space-y-6"><div className="flex items-center justify-between"><div><h1 className="text-2xl font-semibold tracking-tight">Audit trail</h1><p className="text-sm text-muted-foreground">Permanent, time-stamped records of system and ticket activity.</p></div><Button variant="outline" onClick={() => void load()}><RefreshCw className={loading ? "animate-spin" : ""} /> Refresh</Button></div>{error && <ErrorMessage>{error}</ErrorMessage>}<Card><CardContent className="pt-6">{loading && events.length === 0 ? <LoadingPanel label="Loading audit events" /> : <ResponsiveTable headings={["When","Action","Actor","Ticket","Recorded change"]}>{events.map((event) => <tr key={event.id} className="border-t"><td className="whitespace-nowrap px-4 py-3 text-sm">{new Date(event.createdAt).toLocaleString()}</td><td className="px-4 py-3"><Badge variant="outline">{formatValue(event.action)}</Badge></td><td className="px-4 py-3">{event.actorName ?? "System"}</td><td className="px-4 py-3 font-medium text-[#4B2C70]">{event.ticketNumber ?? "—"}</td><td className="max-w-sm truncate px-4 py-3 text-xs text-muted-foreground" title={JSON.stringify(event.newValues ?? event.previousValues)}>{summariseChange(event.newValues ?? event.previousValues)}</td></tr>)}</ResponsiveTable>}</CardContent></Card></div>;
}

function SystemAdministration({ role }: { role: UserRole }) {
  return <div className="space-y-6"><div><h1 className="text-2xl font-semibold tracking-tight">System administration</h1><p className="text-sm text-muted-foreground">Security, data protection and operational recovery controls.</p></div><div className="grid gap-6 md:grid-cols-2"><Card><CardHeader><CardTitle className="flex items-center gap-2"><DatabaseBackup className="text-[#4B2C70]" /> Database backup</CardTitle><CardDescription>Export a password-safe JSON snapshot of operational records for recovery.</CardDescription></CardHeader><CardContent>{role === "SYSTEM_ADMIN" ? <Button className="bg-[#4B2C70] text-white" onClick={() => download("/api/admin/backup")}><Download /> Export backup</Button> : <p className="text-sm text-muted-foreground">Only a system administrator can export backups.</p>}</CardContent></Card><Card><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="text-[#4B2C70]" /> Security controls</CardTitle></CardHeader><CardContent className="space-y-2 text-sm text-muted-foreground"><p>Cookie-based sessions with revocation and expiry</p><p>Role-based route authorization</p><p>Passwords stored using bcrypt hashes</p><p>Immutable audit records and reporter-hidden notes</p><p>Rate-limited authentication endpoints</p></CardContent></Card></div></div>;
}

function Metric({ label, value, icon }: { label: string; value: string | number; icon: ReactNode }) { return <Card><CardContent className="flex items-center justify-between py-1"><div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div><div className="rounded-xl bg-purple-50 p-3 text-[#4B2C70]">{icon}</div></CardContent></Card>; }
function SmallStat({ label, value }: { label: string; value: number }) { return <div className="rounded-xl border p-4"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>; }
function ReportBar({ label, value, maximum, className }: { label: string; value: number; maximum: number; className: string }) { return <div><div className="mb-1 flex items-center justify-between gap-3 text-sm"><span className="text-muted-foreground">{label}</span><span className="font-semibold">{value}</span></div><div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${className}`} style={{ width: `${value === 0 ? 0 : Math.max(4, (value / maximum) * 100)}%` }} /></div></div>; }
function EmptyReport() { return <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No data was recorded for this period.</p>; }
function LoadingPanel({ label }: { label: string }) { return <div className="flex min-h-56 items-center justify-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="animate-spin" /> {label}</div>; }
function ErrorMessage({ children }: { children: ReactNode }) { return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{children}</p>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <div className="space-y-2"><Label>{label}</Label>{children}</div>; }
function ResponsiveTable({ headings, children }: { headings: string[]; children: ReactNode }) { return <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead><tr className="bg-slate-50 text-xs uppercase tracking-wide text-muted-foreground">{headings.map((heading, index) => <th key={`${heading}-${index}`} className="px-4 py-3 font-medium">{heading}</th>)}</tr></thead><tbody>{children}</tbody></table></div>; }
function Priority({ priority }: { priority: string }) { return <Badge className={priority === "CRITICAL" ? "bg-red-100 text-red-800" : priority === "HIGH" ? "bg-orange-100 text-orange-800" : "bg-slate-100 text-slate-700"}>{formatValue(priority)}</Badge>; }
function Filter({ value, onChange, values }: { value: string; onChange: (value: string) => void; values: string[] }) { return <select value={value} onChange={(event) => onChange(event.target.value)} className={selectClasses}><option value="ALL">All</option>{values.map((item) => <option key={item} value={item}>{formatValue(item)}</option>)}</select>; }
function summariseChange(value: Record<string, unknown> | null) { if (!value) return "—"; return Object.entries(value).slice(0, 4).map(([key, item]) => `${formatValue(key)}: ${String(item)}`).join(" · "); }
function download(url: string) { const anchor = document.createElement("a"); anchor.href = url; anchor.download = ""; document.body.appendChild(anchor); anchor.click(); anchor.remove(); }
function downloadSummaryReport(data: Overview) {
  const rows: Array<Array<string | number>> = [
    ["Section", "Item", "Value", "Detail"],
    ["Report period", "Start date", data.periodStart.slice(0, 10), ""],
    ["Report period", "End date", data.periodEnd.slice(0, 10), `${data.periodDays} days`],
    ["Headline", "Created tickets", data.metrics.createdInPeriod, ""],
    ["Headline", "Resolved tickets", data.metrics.resolvedInPeriod, ""],
    ["Headline", "Current active tickets", data.metrics.activeTickets, ""],
    ["Headline", "Resolution rate", `${data.metrics.resolutionRate}%`, ""],
    ["Headline", "Average resolution seconds", data.metrics.averageResolutionSeconds, formatDuration(data.metrics.averageResolutionSeconds)],
    ["Headline", "Median resolution seconds", data.metrics.medianResolutionSeconds, formatDuration(data.metrics.medianResolutionSeconds)],
    ["Operational attention", "Escalated", data.metrics.escalatedTickets, ""],
    ["Operational attention", "Critical open", data.metrics.criticalTickets, ""],
    ["Operational attention", "Unassigned", data.metrics.unassignedTickets, ""],
    ["Operational attention", "Overdue targets", data.metrics.overdueTargets, ""],
    ...data.byCategory.map((item) => ["Category", item.name, item.value, ""] as Array<string | number>),
    ...data.byStatus.map((item) => ["Status", formatValue(item.name), item.value, ""] as Array<string | number>),
    ...data.technicianPerformance.map((item) => ["Technician", item.fullName, item.resolvedTickets, `Active ${item.activeTickets}; handled ${item.handledTickets}; walk-ins ${item.manualTickets}; recorded ${item.workSeconds}s; average resolution ${item.averageResolutionSeconds}s`] as Array<string | number>),
    ...data.resolutionByPriority.map((item) => ["Priority resolution", formatValue(item.name), item.resolvedTickets, `Target ${item.targetSeconds}s; average ${item.averageResolutionSeconds}s; median ${item.medianResolutionSeconds}s; within target ${item.withinTarget}`] as Array<string | number>),
    ...data.resolutionTimeline.map((item) => ["Ticket flow", item.label.slice(0, 10), item.created, `Resolved ${item.resolved}`] as Array<string | number>),
    ...data.backlogAge.map((item) => ["Backlog age", item.name, item.value, ""] as Array<string | number>),
    ...data.sourceBreakdown.map((item) => ["Ticket source", formatValue(item.name), item.value, ""] as Array<string | number>),
    ["Sub-issues", "Parent tickets", data.subIssueSummary.parentsWithSubIssues, ""],
    ["Sub-issues", "Total sub-issues", data.subIssueSummary.totalSubIssues, ""],
    ["Sub-issues", "Resolved sub-issues", data.subIssueSummary.resolvedSubIssues, ""],
    ["Sub-issues", "Overdue work items", data.subIssueSummary.overdueWorkItems, ""],
  ];
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `csis-report-summary-${data.periodStart.slice(0, 10)}-to-${data.periodEnd.slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
function csvCell(value: string | number) { return `"${String(value).replaceAll('"', '""')}"`; }
function dateInputValue(date: Date) { const year = date.getFullYear(); const month = String(date.getMonth() + 1).padStart(2, "0"); const day = String(date.getDate()).padStart(2, "0"); return `${year}-${month}-${day}`; }
function todayDateInput() { return dateInputValue(new Date()); }
function dateRangeFor(days: number) { const end = new Date(); const start = new Date(end); start.setDate(start.getDate() - Math.max(0, days - 1)); return { from: dateInputValue(start), to: dateInputValue(end) }; }
function formatReportDate(value: string) { const [year, month, day] = value.slice(0, 10).split("-").map(Number); return new Date(year, month - 1, day).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); }
function formatTimelineLabel(value: string, periodDays: number) { return new Date(value).toLocaleDateString(undefined, periodDays > 180 ? { month: "short", year: "numeric" } : { day: "numeric", month: "short" }); }
const selectClasses = "h-10 rounded-lg border border-input bg-white px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50";
