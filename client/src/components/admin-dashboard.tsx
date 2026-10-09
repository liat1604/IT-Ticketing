import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Activity, AlertTriangle, BarChart3, CalendarRange, ChevronDown, DatabaseBackup, Download, Eye, GitBranch, LoaderCircle, Mail, Plus, RefreshCw, Search, ShieldCheck, TicketCheck, Timer, Trash2, UserCog } from "lucide-react";

import { api, formatDuration, formatValue, relativeTime } from "@/lib/api";
import type { PortalSection, User, UserRole } from "@/types";
import { CreateTicketDialog } from "@/components/create-ticket-dialog";
import { TicketDetailDialog } from "@/components/ticket-detail-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

type Overview = {
  periodDays: number;
  periodStart: string;
  periodEnd: string;
  metrics: { createdInPeriod: number; resolvedInPeriod: number; activeTickets: number; escalatedTickets: number; criticalTickets: number; unassignedTickets: number; overdueTargets: number; averageResolutionSeconds: number; medianResolutionSeconds: number; resolutionRate: number };
  byCategory: Array<{ name: string; value: number }>;
  byStatus: Array<{ name: string; value: number }>;
  technicianPerformance: Array<{ id: string; fullName: string; activeTickets: number; resolvedTickets: number; workSeconds: number; handledTickets: number; averageResolutionSeconds: number; manualTickets: number }>;
  ticketStatistics: Array<{ scope: "opened" | "closed"; group: "team" | "topic" | "agent"; name: string; tickets: number; assigned: number; overdue: number; reopened: number; serviceSeconds: number; averageResponseSeconds: number | null }>;
  resolutionByPriority: Array<{ name: string; resolvedTickets: number; averageResolutionSeconds: number; medianResolutionSeconds: number; withinTarget: number; targetSeconds: number }>;
  resolutionTimeline: Array<{ label: string; created: number; resolved: number }>;
  backlogAge: Array<{ name: string; value: number }>;
  sourceBreakdown: Array<{ name: string; value: number }>;
  subIssueSummary: { parentsWithSubIssues: number; totalSubIssues: number; resolvedSubIssues: number; overdueWorkItems: number };
  notifications: { pending: number; sent: number; failed: number };
};
type AdminTicket = { id: string; ticketNumber: string; title: string; priority: string; status: string; source: string; category: string; reporterName: string; reporterEmail: string; technicianName: string | null; parentTicketNumber: string | null; dueAt: string | null; createdAt: string };
type ManagedUser = User & { isActive: boolean; createdAt: string; reportedTickets: number; assignedTickets: number; hasOpenTickets: boolean };
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
  const [downloadError, setDownloadError] = useState("");
  const [downloading, setDownloading] = useState<"summary" | "tickets" | "technicians" | null>(null);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [statisticsScope, setStatisticsScope] = useState<"opened" | "closed">("opened");
  const [statisticsGroup, setStatisticsGroup] = useState<"team" | "topic" | "agent">("team");
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

  async function downloadReport(kind: "summary" | "tickets" | "technicians") {
    setDownloadOpen(false); setDownloadError(""); setDownloading(kind);
    try {
      if (kind === "summary") {
        if (!data) throw new Error("Summary data is not available yet.");
        downloadSummaryReport(data);
      } else {
        await downloadCsvReport(reportUrl(kind === "tickets" ? "/api/admin/reports/tickets.csv" : "/api/admin/reports/technicians.csv"), `csis-${kind}-report-${range.from}-to-${range.to}.csv`);
      }
    } catch (caught) {
      setDownloadError(caught instanceof Error ? caught.message : "The report could not be downloaded.");
    } finally { setDownloading(null); }
  }

  if (loading && !data) return <LoadingPanel label="Loading operational reporting" />;
  return <div className="space-y-6">
    <div className="pb-4"><h1 className="text-2xl font-semibold tracking-tight">{showReportHeading ? "Reports and analytics" : "Operational overview"}</h1></div>
    <Card>
      <CardContent className="grid gap-4 pt-6 xl:grid-cols-[190px_170px_170px_1fr] xl:items-end">
        <Field label="Period"><select value={period} onChange={(event) => selectPeriod(event.target.value)} className={`${selectClasses} w-full`}><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last year</option><option value="custom">Custom dates</option></select></Field>
        <Field label="From"><Input type="date" value={range.from} max={range.to} onChange={(event) => updateDate("from", event.target.value)} /></Field>
        <Field label="To"><Input type="date" value={range.to} min={range.from} max={todayDateInput()} onChange={(event) => updateDate("to", event.target.value)} /></Field>
        <div className="flex flex-wrap gap-2 xl:justify-end"><DropdownMenu open={downloadOpen} onOpenChange={setDownloadOpen}><DropdownMenuTrigger render={<Button className="bg-[#4B2C70] text-white hover:bg-[#3d235d]" disabled={Boolean(downloading)||!range.from||!range.to}/>} >{downloading?<LoaderCircle className="animate-spin"/>:<Download/>}{downloading?"Generating...":"Download"}<ChevronDown/></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-2"><ReportDownloadItem title="Summary report" description="Download summary statistics for the selected period." loading={downloading==="summary"} onClick={()=>void downloadReport("summary")}/><ReportDownloadItem title="Ticket report" description="Detailed tickets, requesters, categories, priorities, statuses, technicians, dates and resolution times." loading={downloading==="tickets"} onClick={()=>void downloadReport("tickets")}/><ReportDownloadItem title="Technician report" description="Technician workload and performance, including assigned and resolved tickets and recorded work time." loading={downloading==="technicians"} onClick={()=>void downloadReport("technicians")}/></DropdownMenuContent></DropdownMenu><Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} /> Refresh</Button></div>
      </CardContent>
    </Card>
    {downloadError && <ErrorMessage>{downloadError}</ErrorMessage>}
    {error && <ErrorMessage>{error}</ErrorMessage>}
    {data && <>
      <p className="flex items-center gap-2 text-sm text-muted-foreground"><CalendarRange className="size-4" /> Reporting on {formatReportDate(data.periodStart)} to {formatReportDate(data.periodEnd)} ({data.periodDays} days)</p>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Current active tickets" value={data.metrics.activeTickets} icon={<TicketCheck />} /><Metric label="Created in period" value={data.metrics.createdInPeriod} icon={<Plus />} /><Metric label="Resolved in period" value={data.metrics.resolvedInPeriod} icon={<ShieldCheck />} /><Metric label="Average resolution" value={formatDuration(data.metrics.averageResolutionSeconds)} icon={<Activity />} /></section>
      {showReportHeading && <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Median resolution" value={formatDuration(data.metrics.medianResolutionSeconds)} icon={<Timer />} /><Metric label="Resolution rate" value={`${data.metrics.resolutionRate}%`} icon={<BarChart3 />} /><Metric label="Unassigned tickets" value={data.metrics.unassignedTickets} icon={<AlertTriangle />} /><Metric label="Overdue targets" value={data.metrics.overdueTargets} icon={<CalendarRange />} /></section>}
      <TicketStatisticsTable
        data={data.ticketStatistics}
        scope={statisticsScope}
        onScopeChange={setStatisticsScope}
        group={statisticsGroup}
        onGroupChange={setStatisticsGroup}
        periodStart={data.periodStart}
        periodEnd={data.periodEnd}
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card><CardHeader><CardTitle>Tickets by category</CardTitle><CardDescription>Requests created during the selected period</CardDescription></CardHeader><CardContent><CategoryPieChart data={data.byCategory} /></CardContent></Card>
        <Card><CardHeader><CardTitle>Status distribution</CardTitle><CardDescription>Current status of tickets created in the selected period</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">{data.byStatus.map((item) => <div key={item.name} className="rounded-xl border p-4"><p className="text-sm text-muted-foreground">{formatValue(item.name)}</p><p className="mt-1 text-2xl font-semibold">{item.value}</p></div>)}</CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle>Technician performance</CardTitle><CardDescription>Work handled during the selected period; active is the technician's current queue.</CardDescription></CardHeader><CardContent><ResponsiveTable headings={["Technician","Active","Handled","Resolved","Walk-ins","Recorded time","Avg. resolution"]}>{data.technicianPerformance.map((person) => <tr key={person.id} className="border-t"><td className="px-4 py-3 font-medium">{person.fullName}</td><td className="px-4 py-3">{person.activeTickets}</td><td className="px-4 py-3">{person.handledTickets}</td><td className="px-4 py-3">{person.resolvedTickets}</td><td className="px-4 py-3">{person.manualTickets}</td><td className="whitespace-nowrap px-4 py-3">{formatDuration(person.workSeconds)}</td><td className="whitespace-nowrap px-4 py-3">{person.resolvedTickets ? formatDuration(person.averageResolutionSeconds) : "—"}</td></tr>)}</ResponsiveTable></CardContent></Card>
      {showReportHeading && <ExtendedReports data={data} />}
      {role === "SYSTEM_ADMIN" && <Card><CardHeader><CardTitle>Notification outbox</CardTitle><CardDescription>Persistent email delivery queue health</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-3"><SmallStat label="Pending" value={data.notifications.pending} /><SmallStat label="Processed" value={data.notifications.sent} /><SmallStat label="Retry needed" value={data.notifications.failed} /></CardContent></Card>}
    </>}
  </div>;
}

function ExtendedReports({ data }: { data: Overview }) {
  const backlogMaximum = Math.max(1, ...data.backlogAge.map((item) => item.value));
  const sourceMaximum = Math.max(1, ...data.sourceBreakdown.map((item) => item.value));
  const completedSubIssues = data.subIssueSummary.totalSubIssues === 0 ? 0 : Math.round((data.subIssueSummary.resolvedSubIssues / data.subIssueSummary.totalSubIssues) * 100);

  return <div className="space-y-6">
    <Card><CardHeader><CardTitle>Ticket flow over time</CardTitle><CardDescription>Created versus resolved tickets in each reporting bucket.</CardDescription></CardHeader><CardContent>{data.resolutionTimeline.length === 0 ? <EmptyReport /> : <TimelineLineChart data={data.resolutionTimeline} periodDays={data.periodDays} />}</CardContent></Card>
    <Card><CardHeader><CardTitle>Resolution time and service targets</CardTitle><CardDescription>Elapsed time from ticket creation to resolution, compared with operational priority targets.</CardDescription></CardHeader><CardContent>{data.resolutionByPriority.length === 0 ? <EmptyReport /> : <ResponsiveTable headings={["Priority","Target","Resolved","Average","Median","Within target"]}>{data.resolutionByPriority.map((item) => { const percentage = item.resolvedTickets === 0 ? 0 : Math.round((item.withinTarget / item.resolvedTickets) * 100); return <tr key={item.name} className="border-t"><td className="px-4 py-3"><Priority priority={item.name} /></td><td className="px-4 py-3">{formatDuration(item.targetSeconds)}</td><td className="px-4 py-3">{item.resolvedTickets}</td><td className="px-4 py-3">{formatDuration(item.averageResolutionSeconds)}</td><td className="px-4 py-3">{formatDuration(item.medianResolutionSeconds)}</td><td className="px-4 py-3"><span className={percentage >= 80 ? "text-emerald-700" : percentage >= 50 ? "text-amber-700" : "text-red-700"}>{item.withinTarget} ({percentage}%)</span></td></tr>; })}</ResponsiveTable>}</CardContent></Card>
    <div className="grid gap-6 xl:grid-cols-2">
      <Card><CardHeader><CardTitle>Current backlog age</CardTitle><CardDescription>Open tickets grouped by how long they have been waiting.</CardDescription></CardHeader><CardContent className="space-y-4">{data.backlogAge.length === 0 ? <EmptyReport /> : data.backlogAge.map((item) => <ReportBar key={item.name} label={item.name} value={item.value} maximum={backlogMaximum} className={item.name === "15+ days" ? "bg-red-500" : "bg-amber-500"} />)}</CardContent></Card>
      <Card><CardHeader><CardTitle>Ticket source</CardTitle><CardDescription>How tickets entered the system during this period.</CardDescription></CardHeader><CardContent className="space-y-4">{data.sourceBreakdown.length === 0 ? <EmptyReport /> : data.sourceBreakdown.map((item) => <ReportBar key={item.name} label={formatValue(item.name)} value={item.value} maximum={sourceMaximum} className="bg-sky-500" />)}</CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><GitBranch className="text-[#4B2C70]" /> Sub-issue delivery</CardTitle><CardDescription>Progress on larger tickets that were divided into technician work items.</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><SmallStat label="Parent tickets" value={data.subIssueSummary.parentsWithSubIssues} /><SmallStat label="Total sub-issues" value={data.subIssueSummary.totalSubIssues} /><SmallStat label={`Resolved (${completedSubIssues}%)`} value={data.subIssueSummary.resolvedSubIssues} /><SmallStat label="Overdue work items" value={data.subIssueSummary.overdueWorkItems} /></CardContent></Card>
    <Card><CardHeader><CardTitle>Operational attention</CardTitle><CardDescription>Current queue risks that may need administrator action.</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><SmallStat label="Escalated" value={data.metrics.escalatedTickets} /><SmallStat label="Critical open" value={data.metrics.criticalTickets} /><SmallStat label="Unassigned" value={data.metrics.unassignedTickets} /><SmallStat label="Overdue targets" value={data.metrics.overdueTargets} /></CardContent></Card>
  </div>;
}

type TicketStatisticsRow = Overview["ticketStatistics"][number];

function TicketStatisticsTable({
  data,
  scope,
  onScopeChange,
  group,
  onGroupChange,
  periodStart,
  periodEnd,
}: {
  data: TicketStatisticsRow[];
  scope: "opened" | "closed";
  onScopeChange: (scope: "opened" | "closed") => void;
  group: "team" | "topic" | "agent";
  onGroupChange: (group: "team" | "topic" | "agent") => void;
  periodStart: string;
  periodEnd: string;
}) {
  const rows = data.filter((row) => row.scope === scope && row.group === group);
  const heading = scope === "opened" ? "Opened" : "Closed";
  const groupHeading = group === "team" ? "Department" : group === "topic" ? "Topic" : "Agent";
  const scopeDescription = scope === "opened"
    ? "Tickets submitted during the selected reporting period."
    : "Tickets resolved during the selected reporting period.";

  return <Card>
    <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <CardTitle>Ticket statistics</CardTitle>
        <CardDescription>{scopeDescription} Range: {formatReportDate(periodStart)} – {formatReportDate(periodEnd)}.</CardDescription>
      </div>
      <div className="inline-flex w-fit rounded-lg border bg-slate-50 p-1" role="group" aria-label="Choose opened or closed tickets">
        {(["opened", "closed"] as const).map((item) => <button
          key={item}
          type="button"
          aria-pressed={scope === item}
          onClick={() => onScopeChange(item)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B2C70]/50 ${scope === item ? "bg-[#4B2C70] text-white shadow-sm" : "text-slate-600 hover:bg-white hover:text-slate-900"}`}
        >{item === "opened" ? "Opened tickets" : "Closed tickets"}</button>)}
      </div>
    </CardHeader>
    <CardContent>
      <div className="mb-4 flex flex-wrap gap-1 border-b" role="group" aria-label="Group ticket statistics by">
        {([
          ["team", "Department"],
          ["topic", "Topics"],
          ["agent", "Agent"],
        ] as const).map(([item, label]) => <button
          key={item}
          type="button"
          aria-pressed={group === item}
          onClick={() => onGroupChange(item)}
          className={`min-w-28 rounded-t-lg border border-b-0 px-4 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#4B2C70]/50 ${group === item ? "-mb-px bg-white font-semibold text-[#4B2C70]" : "border-transparent bg-slate-50 text-slate-600 hover:bg-slate-100"}`}
        >{label}</button>)}
      </div>
      <ResponsiveTable headings={[groupHeading, heading, "Assigned", "Overdue", "Reopened", "Service time", "Response time"]}>
        {rows.length === 0 ? <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">No {scope} tickets in this reporting period.</td></tr> : rows.map((row) => <tr key={`${row.scope}-${row.group}-${row.name}`} className="border-t transition-colors hover:bg-slate-50/80">
          <td className="whitespace-nowrap bg-slate-50/70 px-4 py-3 font-medium text-slate-700">{row.name}</td>
          <td className="px-4 py-3 text-right tabular-nums">{row.tickets}</td>
          <td className="px-4 py-3 text-right tabular-nums">{row.assigned}</td>
          <td className="px-4 py-3 text-right tabular-nums">{row.overdue}</td>
          <td className="px-4 py-3 text-right tabular-nums">{row.reopened}</td>
          <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatDuration(row.serviceSeconds)}</td>
          <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{row.averageResponseSeconds === null ? "—" : formatDuration(row.averageResponseSeconds)}</td>
        </tr>)}
      </ResponsiveTable>
      <p className="mt-3 text-xs text-muted-foreground">Response time is the average time until the first public reply from support staff. Service time sums work entries recorded during this period.</p>
    </CardContent>
  </Card>;
}

const categoryChartColors: Record<string, string> = {
  Hardware: "#4B2C70",
  Access: "#7C3AED",
  Network: "#0EA5E9",
  "Physical Hazard": "#DC2626",
  Software: "#10B981",
  Other: "#64748B",
};

const fallbackCategoryChartColors = ["#4B2C70", "#7C3AED", "#0EA5E9", "#DC2626", "#10B981", "#64748B"];

function CategoryPieChart({ data }: { data: Array<{ name: string; value: number }> }) {
  const total = data.reduce((sum, item) => sum + Math.max(0, item.value), 0);
  const size = 220;
  const center = size / 2;
  const radius = 94;
  let currentAngle = -Math.PI / 2;
  const slices = data.filter((item) => item.value > 0).map((item, index) => {
    const fraction = item.value / total;
    const startAngle = currentAngle;
    const endAngle = currentAngle + fraction * Math.PI * 2;
    currentAngle = endAngle;
    const startX = center + radius * Math.cos(startAngle);
    const startY = center + radius * Math.sin(startAngle);
    const endX = center + radius * Math.cos(endAngle);
    const endY = center + radius * Math.sin(endAngle);
    const path = fraction >= 0.9999
      ? null
      : `M ${center} ${center} L ${startX} ${startY} A ${radius} ${radius} 0 ${fraction > 0.5 ? 1 : 0} 1 ${endX} ${endY} Z`;
    return { item, index, color: categoryChartColors[item.name] ?? fallbackCategoryChartColors[index % fallbackCategoryChartColors.length], path };
  });

  return <div className="grid items-center gap-6 md:grid-cols-[minmax(220px,0.9fr)_1fr]">
    <div className="flex justify-center">
      <svg viewBox={`0 0 ${size} ${size}`} className="h-56 w-56 max-w-full" role="img" aria-labelledby="category-pie-title category-pie-description">
        <title id="category-pie-title">Tickets by category</title>
        <desc id="category-pie-description">A pie chart showing the number of tickets created in each category during the selected period.</desc>
        {total === 0 ? <circle cx={center} cy={center} r={radius} fill="#E2E8F0" /> : slices.map(({ item, color, path }) => path ? <path key={item.name} d={path} fill={color} stroke="white" strokeWidth="2"><title>{`${item.name}: ${item.value} tickets`}</title></path> : <circle key={item.name} cx={center} cy={center} r={radius} fill={color} stroke="white" strokeWidth="2"><title>{`${item.name}: ${item.value} tickets`}</title></circle>)}
      </svg>
    </div>
    <div className="space-y-2" role="list" aria-label="Ticket categories">
      {data.map((item, index) => {
        const percentage = total === 0 ? 0 : Math.round((Math.max(0, item.value) / total) * 100);
        const color = categoryChartColors[item.name] ?? fallbackCategoryChartColors[index % fallbackCategoryChartColors.length];
        return <div key={item.name} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm" role="listitem">
          <span className="flex min-w-0 items-center gap-2"><span className="size-3 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: color, opacity: item.value === 0 ? 0.35 : 1 }} /><span className="truncate">{item.name}</span></span>
          <span className="shrink-0 font-semibold tabular-nums">{item.value} <span className="font-normal text-muted-foreground">({percentage}%)</span></span>
        </div>;
      })}
      {total === 0 && <p className="text-sm text-muted-foreground">No tickets were created in this period.</p>}
    </div>
  </div>;
}

function TimelineLineChart({ data, periodDays }: { data: Array<{ label: string; created: number; resolved: number }>; periodDays: number }) {
  const width = 760;
  const height = 300;
  const padding = { top: 22, right: 18, bottom: 48, left: 42 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maximum = Math.max(1, ...data.flatMap((item) => [item.created, item.resolved]));
  const tickCount = Math.min(4, maximum);
  const pointX = (index: number) => data.length === 1 ? padding.left + plotWidth / 2 : padding.left + (index * plotWidth) / (data.length - 1);
  const pointY = (value: number) => padding.top + plotHeight - (Math.max(0, value) / maximum) * plotHeight;
  const createdPoints = data.map((item, index) => `${pointX(index)},${pointY(item.created)}`).join(" ");
  const resolvedPoints = data.map((item, index) => `${pointX(index)},${pointY(item.resolved)}`).join(" ");
  const labelStride = Math.max(1, Math.ceil(data.length / 8));
  const formatPointLabel = (item: { label: string; created: number; resolved: number }) => `${formatTimelineLabel(item.label, periodDays)}: ${item.created} created, ${item.resolved} resolved`;

  return <div className="space-y-4">
    <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm" aria-label="Chart legend">
      <span className="flex items-center gap-2"><span className="h-0.5 w-6 bg-[#4B2C70]" />Created</span>
      <span className="flex items-center gap-2"><span className="h-0.5 w-6 bg-emerald-500" />Resolved</span>
    </div>
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[620px] w-full" role="img" aria-labelledby="ticket-flow-title ticket-flow-description">
        <title id="ticket-flow-title">Ticket flow over time</title>
        <desc id="ticket-flow-description">A line chart comparing created and resolved tickets in each reporting bucket.</desc>
        {Array.from({ length: tickCount + 1 }, (_, index) => {
          const value = Math.round((maximum * index) / tickCount);
          const y = pointY(value);
          return <g key={`tick-${value}`}><line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="#E2E8F0" strokeWidth="1" /><text x={padding.left - 10} y={y + 4} textAnchor="end" className="fill-slate-500 text-[11px]">{value}</text></g>;
        })}
        <polyline points={createdPoints} fill="none" stroke="#4B2C70" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={resolvedPoints} fill="none" stroke="#10B981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {data.map((item, index) => <g key={item.label}>
          <circle cx={pointX(index)} cy={pointY(item.created)} r="4.5" fill="#4B2C70" stroke="white" strokeWidth="2"><title>{`${formatPointLabel(item)} — created`}</title></circle>
          <circle cx={pointX(index)} cy={pointY(item.resolved)} r="4.5" fill="#10B981" stroke="white" strokeWidth="2"><title>{`${formatPointLabel(item)} — resolved`}</title></circle>
          {(index % labelStride === 0 || index === data.length - 1) && <text x={pointX(index)} y={height - 16} textAnchor="middle" className="fill-slate-500 text-[11px]">{formatTimelineLabel(item.label, periodDays)}</text>}
        </g>)}
      </svg>
    </div>
  </div>;
}

function TicketAdministration({ role }: { role: UserRole }) {
  const [tickets, setTickets] = useState<AdminTicket[]>([]); const [search, setSearch] = useState(""); const [status, setStatus] = useState("ALL"); const [priority, setPriority] = useState("ALL"); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [message, setMessage] = useState(""); const [selected, setSelected] = useState<string | null>(null);
  const load = useCallback(async () => { setLoading(true); setError(""); try { const params = new URLSearchParams({ search, status, priority }); setTickets((await api<{ tickets: AdminTicket[] }>(`/api/admin/tickets?${params}`)).tickets); } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load tickets"); } finally { setLoading(false); } }, [priority, search, status]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 200); return () => window.clearTimeout(timer); }, [load]);
  return <div className="space-y-6"><div className="flex flex-wrap items-center justify-between gap-4"><div className="pb-4"><h1 className="text-2xl font-semibold tracking-tight">All tickets</h1></div><CreateTicketDialog onCreated={async (ticket) => { setMessage(`${ticket.ticketNumber} was created and added to the ticket queue.`); await load(); }} /></div>
    {message && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700" role="status">{message}</p>}
    <Card><CardHeader><div className="grid gap-3 md:grid-cols-[1fr_190px_190px_auto]"><label className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Ticket, requester or email" /></label><Filter value={status} onChange={setStatus} allLabel="All statuses" values={["NEW","ASSIGNED","IN_PROGRESS","AWAITING_FEEDBACK","ESCALATED","RESOLVED"]} /><Filter value={priority} onChange={setPriority} allLabel="All priorities" values={["CRITICAL","HIGH","MEDIUM","LOW"]} /><Button variant="outline" onClick={() => void load()}><RefreshCw className={loading ? "animate-spin" : ""} /> Refresh</Button></div></CardHeader><CardContent>{error && <ErrorMessage>{error}</ErrorMessage>}{loading && tickets.length === 0 ? <LoadingPanel label="Loading tickets" /> : <ResponsiveTable headings={["Ticket","Requester","Category","Priority","Status","Assigned","Created",""]}>{tickets.map((ticket) => <tr key={ticket.id} className="border-t"><td className="px-4 py-3"><p className="font-semibold text-[#4B2C70]">{ticket.ticketNumber}</p><p className="max-w-56 truncate text-sm">{ticket.title}</p></td><td className="px-4 py-3"><p>{ticket.reporterName}</p><p className="text-xs text-muted-foreground">{ticket.reporterEmail}</p></td><td className="px-4 py-3">{ticket.category}</td><td className="px-4 py-3"><Priority priority={ticket.priority} /></td><td className="px-4 py-3"><Badge variant="secondary">{formatValue(ticket.status)}</Badge></td><td className="px-4 py-3">{ticket.technicianName ?? "Unassigned"}</td><td className="px-4 py-3 text-sm">{relativeTime(ticket.createdAt)}</td><td className="px-4 py-3"><Button size="icon" variant="ghost" aria-label={`View ${ticket.ticketNumber}`} onClick={() => setSelected(ticket.id)}><Eye /></Button></td></tr>)}</ResponsiveTable>}</CardContent></Card>
    <TicketDetailDialog ticketId={selected} open={selected !== null} role={role} onOpenChange={(open) => !open && setSelected(null)} onChanged={load} />
  </div>;
}

function UserAdministration({ currentUser }: { currentUser: User }) {
  const [deleteTarget, setDeleteTarget] = useState<ManagedUser | null>(null);
  const [deleteStep, setDeleteStep] = useState<"review" | "final" | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api<{ users: ManagedUser[] }>("/api/admin/users?search=" + encodeURIComponent(search));
      setUsers(result.users);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load users");
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 200);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await api("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({
          fullName: data.get("fullName"),
          email: data.get("email"),
          password: data.get("password"),
          role: data.get("role"),
        }),
      });
      setOpen(false);
      form.reset();
      setMessage("User account created successfully.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create user");
    } finally {
      setSaving(false);
    }
  }

  async function updateUser(user: ManagedUser, changes: { role?: UserRole; isActive?: boolean }) {
    setError("");
    setMessage("");
    try {
      await api("/api/admin/users/" + user.id, { method: "PATCH", body: JSON.stringify(changes) });
      setMessage(user.fullName + "'s account was updated.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update user");
    }
  }

  async function deleteUser() {
    if (!deleteTarget || deleting || deleteStep !== "final") return;
    setDeleting(true);
    setDeleteError("");
    setError("");
    setMessage("");
    try {
      await api("/api/admin/users/" + deleteTarget.id, { method: "DELETE" });
      setMessage(deleteTarget.fullName + "'s account was deleted. Ticket and audit history were retained.");
      setDeleteTarget(null);
      setDeleteStep(null);
      await load();
    } catch (caught) {
      setDeleteError(caught instanceof Error ? caught.message : "Could not delete user");
    } finally {
      setDeleting(false);
    }
  }

  function closeDeleteDialog() {
    if (deleting) return;
    setDeleteStep(null);
    setDeleteTarget(null);
    setDeleteError("");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="pb-4">
          <h1 className="text-2xl font-semibold tracking-tight">Users and permissions</h1>
        </div>
        <Button className="bg-[#4B2C70] text-white" onClick={() => setOpen(true)}><Plus /> Create user</Button>
      </div>

      {error && <ErrorMessage>{error}</ErrorMessage>}
      {message && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700" role="status">{message}</p>}

      <Card>
        <CardHeader>
          <label className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Search name or NWU email" />
          </label>
        </CardHeader>
        <CardContent>
          {loading && users.length === 0 ? <LoadingPanel label="Loading users" /> : (
            <ResponsiveTable headings={["User", "Role", "Status", "Ticket activity", "Created", ""]}>
              {users.map((managed) => {
                const systemRestricted = currentUser.role !== "SYSTEM_ADMIN" && managed.role === "SYSTEM_ADMIN";
                const cannotDeactivate = managed.isActive && managed.hasOpenTickets;
                const ticketRestriction = managed.hasOpenTickets
                  ? "Resolve or reassign open tickets before deactivating or deleting this account."
                  : undefined;
                return (
                  <tr key={managed.id} className="border-t">
                    <td className="px-4 py-3">
                      <p className="font-medium">{managed.fullName}</p>
                      <p className="text-xs text-muted-foreground">{managed.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={managed.role}
                        disabled={systemRestricted}
                        onChange={(event) => void updateUser(managed, { role: event.target.value as UserRole })}
                        className={selectClasses}
                      >
                        {(["REPORTER", "TECHNICIAN", "ADMIN", ...(currentUser.role === "SYSTEM_ADMIN" ? ["SYSTEM_ADMIN"] : [])] as UserRole[]).map((role) => (
                          <option key={role} value={role}>{formatValue(role)}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={managed.isActive ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}>
                        {managed.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {managed.reportedTickets} reported · {managed.assignedTickets} assigned
                      {managed.hasOpenTickets && <p className="mt-1 max-w-56 text-xs text-red-700">Resolve or reassign open tickets before changing this account.</p>}
                    </td>
                    <td className="px-4 py-3 text-sm">{new Date(managed.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={managed.id === currentUser.id || systemRestricted || cannotDeactivate}
                        title={cannotDeactivate ? ticketRestriction : undefined}
                        onClick={() => void updateUser(managed, { isActive: !managed.isActive })}
                      >
                        {managed.isActive ? "Deactivate" : "Activate"}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="ml-2"
                        disabled={managed.id === currentUser.id || systemRestricted || deleting || managed.hasOpenTickets}
                        title={managed.hasOpenTickets ? ticketRestriction : undefined}
                        onClick={() => {
                          setDeleteError("");
                          setDeleteTarget(managed);
                          setDeleteStep("review");
                        }}
                      >
                        <Trash2 /> Delete
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </ResponsiveTable>
          )}
        </CardContent>
      </Card>

      <Dialog open={deleteStep === "review" && Boolean(deleteTarget)} onOpenChange={(next) => !next && closeDeleteDialog()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Delete user account?</DialogTitle>
            <DialogDescription>
              Remove login access for {deleteTarget?.fullName} ({deleteTarget?.email}). Ticket and audit history will be retained.
              Continue to review permanent deletion.
            </DialogDescription>
          </DialogHeader>
          {deleteError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{deleteError}</p>}
          <DialogFooter>
            <Button variant="outline" disabled={deleting} onClick={closeDeleteDialog}>Cancel</Button>
            <Button variant="destructive" disabled={deleting} onClick={() => setDeleteStep("final")}>Continue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteStep === "final" && Boolean(deleteTarget)} onOpenChange={(next) => !next && closeDeleteDialog()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Permanently delete this account?</DialogTitle>
            <DialogDescription>
              This cannot be undone. {deleteTarget?.fullName} will lose access immediately. Ticket, comment, and audit history will stay linked to a deleted-account record.
            </DialogDescription>
          </DialogHeader>
          {deleteError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{deleteError}</p>}
          <DialogFooter>
            <Button variant="outline" disabled={deleting} onClick={closeDeleteDialog}>Cancel</Button>
            <Button variant="destructive" disabled={deleting} onClick={() => void deleteUser()}>
              {deleting ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
              {deleting ? "Deleting..." : "Permanently delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={(next) => !saving && setOpen(next)}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={createUser}>
            <DialogHeader>
              <DialogTitle>Create user account</DialogTitle>
              <DialogDescription>Provision secure access using an NWU email address.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-5">
              <Field label="Full name"><Input name="fullName" minLength={2} maxLength={120} required /></Field>
              <Field label="NWU email"><Input name="email" type="email" placeholder="name@mynwu.ac.za" required /></Field>
              <Field label="Temporary password">
                <Input name="password" type="password" minLength={12} required />
                <p className="text-xs text-muted-foreground">At least 12 characters with uppercase, lowercase and a number.</p>
              </Field>
              <Field label="Role">
                <select name="role" className={selectClasses} defaultValue="REPORTER">
                  <option value="REPORTER">Reporter</option>
                  <option value="TECHNICIAN">Technician</option>
                  <option value="ADMIN">Administrator</option>
                  {currentUser.role === "SYSTEM_ADMIN" && <option value="SYSTEM_ADMIN">System administrator</option>}
                </select>
              </Field>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" className="bg-[#4B2C70] text-white" disabled={saving}>
                {saving ? <LoaderCircle className="animate-spin" /> : <UserCog />}
                {saving ? "Creating..." : "Create account"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
function AuditLog() {
  const [events, setEvents] = useState<AuditEvent[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const load = useCallback(async () => { setLoading(true); try { setEvents((await api<{ events: AuditEvent[] }>("/api/admin/audit?limit=250")).events); } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load audit log"); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  return <div className="space-y-6"><div className="flex items-center justify-between pb-4"><div><h1 className="text-2xl font-semibold tracking-tight">Audit trail</h1></div><Button variant="outline" onClick={() => void load()}><RefreshCw className={loading ? "animate-spin" : ""} /> Refresh</Button></div>{error && <ErrorMessage>{error}</ErrorMessage>}<Card><CardContent className="pt-6">{loading && events.length === 0 ? <LoadingPanel label="Loading audit events" /> : <ResponsiveTable headings={["When","Action","Actor","Ticket","Recorded change"]}>{events.map((event) => <tr key={event.id} className="border-t"><td className="whitespace-nowrap px-4 py-3 text-sm">{new Date(event.createdAt).toLocaleString()}</td><td className="px-4 py-3"><Badge variant="outline">{formatValue(event.action)}</Badge></td><td className="px-4 py-3">{event.actorName ?? "System"}</td><td className="px-4 py-3 font-medium text-[#4B2C70]">{event.ticketNumber ?? "—"}</td><td className="max-w-sm truncate px-4 py-3 text-xs text-muted-foreground" title={JSON.stringify(event.newValues ?? event.previousValues)}>{summariseChange(event.newValues ?? event.previousValues)}</td></tr>)}</ResponsiveTable>}</CardContent></Card></div>;
}

function SystemAdministration({ role }: { role: UserRole }) {
  const [email,setEmail]=useState<{configured:boolean;connected:boolean;host:string|null;port:number;secure:boolean;pending:number;sent:number;failed:number;retryCount:number;lastError:string|null;connectionError:string|null}|null>(null),[loadingEmail,setLoadingEmail]=useState(false),[testing,setTesting]=useState(false),[emailMessage,setEmailMessage]=useState(""),[emailError,setEmailError]=useState("");
  const loadEmail=useCallback(async()=>{if(role!=="SYSTEM_ADMIN")return;setLoadingEmail(true);setEmailError("");try{setEmail(await api("/api/admin/email/status"));}catch(caught){setEmailError(caught instanceof Error?caught.message:"Could not load email status");}finally{setLoadingEmail(false);}},[role]);
  useEffect(()=>{void loadEmail();},[loadEmail]);
  async function testEmail(){setTesting(true);setEmailError("");setEmailMessage("");try{const result=await api<{message:string}>("/api/admin/email/test",{method:"POST"});setEmailMessage(result.message);await loadEmail();}catch(caught){setEmailError(caught instanceof Error?caught.message:"Test email failed");}finally{setTesting(false);}}
  return <div className="space-y-6"><div className="pb-4"><h1 className="text-2xl font-semibold tracking-tight">System administration</h1></div>{role==="SYSTEM_ADMIN"&&<Card><CardHeader><CardTitle className="flex items-center gap-2"><Mail className="text-[#4B2C70]"/>Email delivery</CardTitle><CardDescription>Gmail SMTP connection and notification-outbox delivery health. Credentials remain server-side.</CardDescription></CardHeader><CardContent className="space-y-4">{loadingEmail&&!email?<LoadingPanel label="Checking SMTP connection"/>:email&&<><div className="flex flex-wrap items-center gap-2"><Badge className={email.connected?"bg-emerald-100 text-emerald-800":email.configured?"bg-red-100 text-red-800":"bg-amber-100 text-amber-900"}>{email.connected?"Connected":email.configured?"Connection failed":"Not configured"}</Badge>{email.host&&<span className="text-sm text-muted-foreground">{email.host}:{email.port} · {email.secure?"TLS":"STARTTLS"}</span>}</div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><SmallStat label="Pending" value={email.pending}/><SmallStat label="Successfully sent" value={email.sent}/><SmallStat label="Failed" value={email.failed}/><SmallStat label="Retries" value={email.retryCount}/></div>{(email.lastError||email.connectionError)&&<p className="rounded-lg bg-red-50 p-3 text-sm text-red-700"><strong>Last error:</strong> {email.connectionError??email.lastError}</p>}</>} {emailError&&<ErrorMessage>{emailError}</ErrorMessage>}{emailMessage&&<p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700" role="status">{emailMessage}</p>}<div className="flex flex-wrap gap-2"><Button className="bg-[#4B2C70] text-white" disabled={testing||!email?.configured} onClick={()=>void testEmail()}>{testing?<LoaderCircle className="animate-spin"/>:<Mail/>}{testing?"Sending...":"Send test email"}</Button><Button variant="outline" disabled={loadingEmail} onClick={()=>void loadEmail()}><RefreshCw className={loadingEmail?"animate-spin":""}/>Refresh</Button></div></CardContent></Card>}<div className="grid gap-6 md:grid-cols-2"><Card><CardHeader><CardTitle className="flex items-center gap-2"><DatabaseBackup className="text-[#4B2C70]" /> Database backup</CardTitle><CardDescription>Export a password-safe JSON snapshot of operational records for recovery.</CardDescription></CardHeader><CardContent>{role === "SYSTEM_ADMIN" ? <Button className="bg-[#4B2C70] text-white" onClick={() => download("/api/admin/backup")}><Download /> Export backup</Button> : <p className="text-sm text-muted-foreground">Only a system administrator can export backups.</p>}</CardContent></Card><Card><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="text-[#4B2C70]" /> Security controls</CardTitle></CardHeader><CardContent className="space-y-2 text-sm text-muted-foreground"><p>Cookie-based sessions with revocation and expiry</p><p>Role-based route authorization</p><p>Passwords stored using bcrypt hashes</p><p>Immutable audit records and reporter-hidden notes</p><p>Rate-limited authentication endpoints</p></CardContent></Card></div></div>;
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
function Filter({ value, onChange, allLabel, values }: { value: string; onChange: (value: string) => void; allLabel: string; values: string[] }) { return <select value={value} onChange={(event) => onChange(event.target.value)} className={selectClasses} aria-label={allLabel}><option value="ALL">{allLabel}</option>{values.map((item) => <option key={item} value={item}>{formatValue(item)}</option>)}</select>; }
function summariseChange(value: Record<string, unknown> | null) { if (!value) return "—"; return Object.entries(value).slice(0, 4).map(([key, item]) => `${formatValue(key)}: ${String(item)}`).join(" · "); }
function download(url: string) { const anchor = document.createElement("a"); anchor.href = url; anchor.download = ""; document.body.appendChild(anchor); anchor.click(); anchor.remove(); }
function ReportDownloadItem({ title, description, loading, onClick }: { title: string; description: string; loading: boolean; onClick: () => void }) {
  return <DropdownMenuItem className="items-start gap-3 p-3" onClick={onClick} disabled={loading}><span className="mt-0.5 rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-bold text-[#4B2C70]">CSV</span><span className="min-w-0"><span className="flex items-center gap-2 font-medium">{title}{loading&&<LoaderCircle className="size-3.5 animate-spin"/>}</span><span className="mt-0.5 block whitespace-normal text-xs leading-5 text-muted-foreground">{description}</span></span></DropdownMenuItem>;
}
async function downloadCsvReport(url: string, fallbackFilename: string) {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) {
    const result = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(result?.error ?? "The report could not be generated.");
  }
  const blobUrl = URL.createObjectURL(await response.blob());
  const disposition = response.headers.get("content-disposition") ?? "";
  const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? fallbackFilename;
  const anchor = document.createElement("a"); anchor.href = blobUrl; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 0);
}
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
