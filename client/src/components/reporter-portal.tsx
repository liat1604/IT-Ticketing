import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  CheckCircle2,
  Clock3,
  Inbox,
  LoaderCircle,
  MessageSquare,
  Plus,
  Search,
  TicketCheck,
} from "lucide-react";

import { api, formatValue, relativeTime } from "@/lib/api";
import type { PortalSection, TicketSummary } from "@/types";
import { TicketDetailDialog } from "@/components/ticket-detail-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Category = { id: number; name: string };
type Location = { id: number; name: string };

export function ReporterPortal({ section }: { section: PortalSection }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [metadata, ticketData] = await Promise.all([
        api<{ categories: Category[]; locations: Location[] }>("/api/tickets/metadata"),
        api<{ tickets: TicketSummary[] }>("/api/portal/tickets/mine"),
      ]);
      setCategories(metadata.categories);
      setLocations(metadata.locations);
      setTickets(ticketData.tickets);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not load your tickets");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function createTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const result = await api<{ ticket: TicketSummary }>("/api/tickets", {
        method: "POST",
        body: JSON.stringify({
          categoryId: Number(formData.get("categoryId")),
          locationId: formData.get("locationId") ? Number(formData.get("locationId")) : null,
          locationDetails: String(formData.get("locationDetails") ?? ""),
          stationReference: String(formData.get("stationReference") ?? ""),
          title: String(formData.get("title") ?? ""),
          description: String(formData.get("description") ?? ""),
          priority: String(formData.get("priority") ?? "MEDIUM"),
        }),
      });
      form.reset();
      setSuccess(`${result.ticket.ticketNumber} was submitted successfully.`);
      await loadData();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Ticket submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  const filteredTickets = useMemo(() => {
    const term = search.trim().toLowerCase();
    return tickets.filter((ticket) => {
      const matchesStatus = status === "ALL" || ticket.status === status;
      const matchesSearch = !term
        || ticket.ticketNumber.toLowerCase().includes(term)
        || ticket.title.toLowerCase().includes(term)
        || ticket.category.toLowerCase().includes(term);
      return matchesStatus && matchesSearch;
    });
  }, [search, status, tickets]);

  const active = tickets.filter((ticket) => ticket.status !== "RESOLVED").length;
  const waiting = tickets.filter((ticket) => ticket.status === "AWAITING_FEEDBACK").length;
  const resolved = tickets.filter((ticket) => ticket.status === "RESOLVED").length;

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-3">
        <SummaryCard label="Active requests" value={active} icon={<TicketCheck className="size-5" />} />
        <SummaryCard label="Waiting on you" value={waiting} icon={<Clock3 className="size-5" />} />
        <SummaryCard label="Resolved" value={resolved} icon={<CheckCircle2 className="size-5" />} />
      </section>

      {section === "overview" && (
        <section className="grid gap-6 xl:grid-cols-[420px_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Log a new fault</CardTitle>
              <CardDescription>Provide enough detail for the technician to locate and diagnose the problem.</CardDescription>
            </CardHeader>
            <CardContent>
              <TicketForm
                categories={categories}
                locations={locations}
                submitting={submitting}
                onSubmit={createTicket}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent requests</CardTitle>
              <CardDescription>Your latest support activity and technician responses.</CardDescription>
            </CardHeader>
            <CardContent>
              <TicketList
                tickets={tickets.slice(0, 5)}
                loading={loading}
                onOpen={setSelectedTicketId}
              />
            </CardContent>
          </Card>
        </section>
      )}

      {section === "tickets" && (
        <Card>
          <CardHeader>
            <CardTitle>My tickets</CardTitle>
            <CardDescription>Search your complete request history and open a ticket to continue the conversation.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_220px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Search ticket number, title, or category" />
              </div>
              <select value={status} onChange={(event) => setStatus(event.target.value)} className={selectClasses} aria-label="Filter by status">
                <option value="ALL">All statuses</option>
                <option value="NEW">New</option>
                <option value="ASSIGNED">Assigned</option>
                <option value="IN_PROGRESS">In progress</option>
                <option value="AWAITING_FEEDBACK">Awaiting feedback</option>
                <option value="ESCALATED">Escalated</option>
                <option value="RESOLVED">Resolved</option>
              </select>
            </div>
            <TicketList tickets={filteredTickets} loading={loading} onOpen={setSelectedTicketId} />
          </CardContent>
        </Card>
      )}

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
      {success && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700" role="status">{success}</p>}

      <TicketDetailDialog
        ticketId={selectedTicketId}
        open={selectedTicketId !== null}
        role="REPORTER"
        onOpenChange={(open) => !open && setSelectedTicketId(null)}
        onChanged={loadData}
      />
    </div>
  );
}

function TicketForm({
  categories,
  locations,
  submitting,
  onSubmit,
}: {
  categories: Category[];
  locations: Location[];
  submitting: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div className="space-y-2">
        <Label htmlFor="categoryId">Category</Label>
        <select id="categoryId" name="categoryId" className={selectClasses} defaultValue="" required>
          <option value="" disabled>Select a category</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="priority">Priority or urgency</Label>
        <select id="priority" name="priority" className={selectClasses} defaultValue="MEDIUM" required>
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
          <option value="CRITICAL">Critical or hazardous</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="locationId">Campus location</Label>
        <select id="locationId" name="locationId" className={selectClasses} defaultValue="">
          <option value="">Select a known location</option>
          {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
        </select>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
        <div className="space-y-2">
          <Label htmlFor="locationDetails">Location details</Label>
          <Input id="locationDetails" name="locationDetails" placeholder="For example: Lab G14" maxLength={200} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="stationReference">Station or asset ID</Label>
          <Input id="stationReference" name="stationReference" placeholder="For example: Station 12" maxLength={50} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="title">Issue summary</Label>
        <Input id="title" name="title" placeholder="Briefly describe the problem" minLength={5} maxLength={160} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Issue description</Label>
        <Textarea id="description" name="description" className="min-h-28" placeholder="Explain what happened, when it started, and any troubleshooting already attempted." minLength={10} maxLength={4000} required />
      </div>
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
        Hardware safety: if you smell burning, see exposed wiring, or suspect an electrical hazard, switch off the equipment if safe, keep others away, and select Critical.
      </p>
      <Button type="submit" className="w-full bg-[#4B2C70] text-white hover:bg-[#3d235d]" disabled={submitting || categories.length === 0}>
        {submitting ? <LoaderCircle className="animate-spin" /> : <Plus />}
        {submitting ? "Submitting..." : "Submit ticket"}
      </Button>
    </form>
  );
}

function TicketList({ tickets, loading, onOpen }: { tickets: TicketSummary[]; loading: boolean; onOpen: (id: string) => void }) {
  if (loading) {
    return <div className="flex min-h-48 items-center justify-center"><LoaderCircle className="size-7 animate-spin text-[#4B2C70]" /></div>;
  }

  if (tickets.length === 0) {
    return (
      <div className="flex min-h-48 flex-col items-center justify-center text-center">
        <Inbox className="size-10 text-slate-300" />
        <p className="mt-4 font-medium">No matching tickets</p>
        <p className="mt-1 text-sm text-muted-foreground">New requests and updates will appear here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {tickets.map((ticket) => (
        <button key={ticket.id} type="button" onClick={() => onOpen(ticket.id)} className="w-full rounded-xl border bg-white p-4 text-left transition hover:border-purple-200 hover:shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-[#4B2C70]">{ticket.ticketNumber}</p>
              <h3 className="mt-1 font-medium">{ticket.title}</h3>
            </div>
            <StatusBadge status={ticket.status} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">{ticket.category}</Badge>
            <PriorityBadge priority={ticket.priority} />
            {ticket.commentCount ? <span className="flex items-center gap-1"><MessageSquare className="size-3.5" />{ticket.commentCount}</span> : null}
            <span>{relativeTime(ticket.createdAt)}</span>
            {ticket.technicianName && <span>Assigned to {ticket.technicianName}</span>}
          </div>
        </button>
      ))}
    </div>
  );
}

function SummaryCard({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between py-1">
        <div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>
        <div className="rounded-xl bg-purple-50 p-3 text-[#4B2C70]">{icon}</div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const className = status === "RESOLVED" ? "bg-emerald-100 text-emerald-800" : status === "ESCALATED" ? "bg-red-100 text-red-800" : status === "AWAITING_FEEDBACK" ? "bg-yellow-100 text-yellow-900" : status === "IN_PROGRESS" ? "bg-cyan-100 text-cyan-900" : "bg-purple-100 text-purple-800";
  return <Badge className={className}>{formatValue(status)}</Badge>;
}

function PriorityBadge({ priority }: { priority: string }) {
  const className = priority === "CRITICAL" ? "bg-red-100 text-red-800" : priority === "HIGH" ? "bg-orange-100 text-orange-800" : "bg-slate-100 text-slate-700";
  return <Badge className={className}>{formatValue(priority)}</Badge>;
}

const selectClasses = "h-10 w-full rounded-lg border border-input bg-white px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50";
