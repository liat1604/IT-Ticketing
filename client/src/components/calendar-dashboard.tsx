import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, LoaderCircle, MapPin, Plus, Trash2 } from "lucide-react";

import { api, formatValue } from "@/lib/api";
import type { UserRole } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type ScheduleEvent = {
  id: string; title: string; eventType: "SLA" | "SITE_VISIT" | "MAINTENANCE" | "FOLLOW_UP";
  startsAt: string; endsAt: string | null; location: string | null; notes: string | null;
  ticketId: string | null; ticketNumber: string | null; assignedTo: string | null; assignedName: string | null; createdBy: string;
};
type Staff = { id: string; fullName: string; role: string };
type TicketOption = { id: string; ticketNumber: string; title: string };

export function CalendarDashboard({ userId, role }: { userId: string; role: UserRole }) {
  const [cursor, setCursor] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [now] = useState(() => Date.now());
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [tickets, setTickets] = useState<TicketOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const range = useMemo(() => {
    const from = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const to = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    return { from, to };
  }, [cursor]);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const query = new URLSearchParams({ from: range.from.toISOString(), to: range.to.toISOString() });
      const result = await api<{ events: ScheduleEvent[]; staff: Staff[]; tickets: TicketOption[] }>(`/api/calendar?${query}`);
      setEvents(result.events); setStaff(result.staff); setTickets(result.tickets);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not load service calendar");
    } finally { setLoading(false); }
  }, [range]);

  useEffect(() => { void load(); }, [load]);

  const days = useMemo(() => {
    const firstWeekday = (range.from.getDay() + 6) % 7;
    const count = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    return [...Array(firstWeekday).fill(null), ...Array.from({ length: count }, (_, index) => index + 1)];
  }, [cursor, range]);

  const upcoming = [...events].filter((event) => new Date(event.startsAt).getTime() >= now).slice(0, 8);

  async function createEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await api("/api/calendar", { method: "POST", body: JSON.stringify({
        title: data.get("title"), eventType: data.get("eventType"),
        startsAt: new Date(String(data.get("startsAt"))).toISOString(),
        endsAt: data.get("endsAt") ? new Date(String(data.get("endsAt"))).toISOString() : null,
        location: data.get("location"), notes: data.get("notes"),
        ticketId: data.get("ticketId") || null, assignedTo: data.get("assignedTo") || null,
      }) });
      setOpen(false); form.reset(); await load();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not create event");
    } finally { setSaving(false); }
  }

  async function removeEvent(eventId: string) {
    try { await api(`/api/calendar/${eventId}`, { method: "DELETE" }); await load(); }
    catch (caughtError) { setError(caughtError instanceof Error ? caughtError.message : "Could not delete event"); }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div><h1 className="text-2xl font-semibold tracking-tight">Service calendar</h1><p className="text-sm text-muted-foreground">Plan SLA targets, site visits, maintenance and follow-ups.</p></div>
        <Button className="bg-[#4B2C70] text-white hover:bg-[#3d235d]" onClick={() => setOpen(true)}><Plus /> Add event</Button>
      </div>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div><CardTitle>{cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</CardTitle><CardDescription>{events.length} scheduled event{events.length === 1 ? "" : "s"}</CardDescription></div>
            <div className="flex gap-2"><Button size="icon" variant="outline" aria-label="Previous month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><ChevronLeft /></Button><Button variant="outline" onClick={() => setCursor(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Today</Button><Button size="icon" variant="outline" aria-label="Next month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><ChevronRight /></Button></div>
          </CardHeader>
          <CardContent>
            {loading ? <div className="flex min-h-80 items-center justify-center"><LoaderCircle className="animate-spin text-[#4B2C70]" /></div> : <div className="grid grid-cols-7 overflow-hidden rounded-xl border">
              {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((day) => <div key={day} className="border-b bg-slate-50 p-2 text-center text-xs font-semibold text-muted-foreground">{day}</div>)}
              {days.map((day, index) => {
                const dayEvents = day ? events.filter((event) => new Date(event.startsAt).getDate() === day) : [];
                const isToday = day === new Date().getDate() && cursor.getMonth() === new Date().getMonth() && cursor.getFullYear() === new Date().getFullYear();
                return <div key={`${day ?? 'empty'}-${index}`} className="min-h-28 border-b border-r p-2 last:border-r-0">
                  {day && <><span className={isToday ? "inline-flex size-7 items-center justify-center rounded-full bg-[#4B2C70] text-xs font-semibold text-white" : "text-xs font-semibold"}>{day}</span><div className="mt-1 space-y-1">{dayEvents.slice(0, 3).map((item) => <button key={item.id} title={item.title} className={`block w-full truncate rounded px-2 py-1 text-left text-[11px] ${eventStyle(item.eventType)}`}>{new Date(item.startsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} {item.title}</button>)}{dayEvents.length > 3 && <p className="text-[11px] text-muted-foreground">+{dayEvents.length - 3} more</p>}</div></>}
                </div>;
              })}
            </div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><CalendarDays className="size-5 text-[#4B2C70]" /> Upcoming agenda</CardTitle><CardDescription>Next scheduled service activities</CardDescription></CardHeader>
          <CardContent className="space-y-3">{upcoming.length === 0 ? <p className="py-12 text-center text-sm text-muted-foreground">No upcoming events this month.</p> : upcoming.map((event) => <article key={event.id} className="rounded-xl border p-3">
            <div className="flex items-start justify-between gap-2"><div><Badge className={eventStyle(event.eventType)}>{formatValue(event.eventType)}</Badge><h2 className="mt-2 font-semibold">{event.title}</h2></div>{(event.createdBy === userId || role === "ADMIN" || role === "SYSTEM_ADMIN") && <Button size="icon" variant="ghost" aria-label={`Delete ${event.title}`} onClick={() => void removeEvent(event.id)}><Trash2 className="size-4 text-red-600" /></Button>}</div>
            <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"><Clock3 className="size-3.5" />{new Date(event.startsAt).toLocaleString()}</p>
            {event.location && <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground"><MapPin className="size-3.5" />{event.location}</p>}
            {(event.ticketNumber || event.assignedName) && <p className="mt-2 text-xs text-muted-foreground">{[event.ticketNumber, event.assignedName].filter(Boolean).join(" · ")}</p>}
          </article>)}</CardContent>
        </Card>
      </div>
      <Dialog open={open} onOpenChange={(next) => !saving && setOpen(next)}><DialogContent className="sm:max-w-xl"><form onSubmit={createEvent}><DialogHeader><DialogTitle>Schedule service activity</DialogTitle><DialogDescription>Add an operational event and optionally link it to a ticket.</DialogDescription></DialogHeader>
        <div className="grid gap-4 py-5 sm:grid-cols-2">
          <Field label="Title" span><Input name="title" minLength={3} maxLength={160} required /></Field>
          <Field label="Event type"><select name="eventType" className={selectClasses} defaultValue="FOLLOW_UP"><option value="SLA">SLA target</option><option value="SITE_VISIT">Site visit</option><option value="MAINTENANCE">Maintenance</option><option value="FOLLOW_UP">Follow-up</option></select></Field>
          <Field label="Assigned to"><select name="assignedTo" className={selectClasses} defaultValue={userId}><option value="">Unassigned</option>{staff.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}</select></Field>
          <Field label="Starts"><Input type="datetime-local" name="startsAt" required /></Field><Field label="Ends"><Input type="datetime-local" name="endsAt" /></Field>
          <Field label="Linked ticket" span><select name="ticketId" className={selectClasses}><option value="">No linked ticket</option>{tickets.map((ticket) => <option key={ticket.id} value={ticket.id}>{ticket.ticketNumber} — {ticket.title}</option>)}</select></Field>
          <Field label="Location" span><Input name="location" maxLength={200} placeholder="Building, room or online" /></Field><Field label="Notes" span><Textarea name="notes" maxLength={2000} /></Field>
        </div><DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" className="bg-[#4B2C70] text-white" disabled={saving}>{saving ? <LoaderCircle className="animate-spin" /> : <Plus />}{saving ? "Saving..." : "Create event"}</Button></DialogFooter>
      </form></DialogContent></Dialog>
    </div>
  );
}

function Field({ label, span = false, children }: { label: string; span?: boolean; children: ReactNode }) { return <div className={span ? "space-y-2 sm:col-span-2" : "space-y-2"}><Label>{label}</Label>{children}</div>; }
function eventStyle(type: ScheduleEvent["eventType"]) { return type === "SLA" ? "bg-red-100 text-red-800" : type === "SITE_VISIT" ? "bg-blue-100 text-blue-800" : type === "MAINTENANCE" ? "bg-amber-100 text-amber-800" : "bg-purple-100 text-[#4B2C70]"; }
const selectClasses = "h-10 w-full rounded-lg border border-input bg-white px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50";
