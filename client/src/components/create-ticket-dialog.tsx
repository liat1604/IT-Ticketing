import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { LoaderCircle, Plus, Search, ShieldAlert } from "lucide-react";

import { api } from "@/lib/api";
import type { TicketSummary } from "@/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Option = { id: number; name: string };
type Reporter = { id: string; fullName: string; email: string };
type FieldName = "reporterId" | "categoryId" | "priority" | "title" | "description";

export function CreateTicketDialog({ onCreated }: { onCreated: (ticket: TicketSummary) => void | Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [categories, setCategories] = useState<Option[]>([]);
  const [locations, setLocations] = useState<Option[]>([]);
  const [reporters, setReporters] = useState<Reporter[]>([]);
  const [reporterQuery, setReporterQuery] = useState("");
  const [reporterId, setReporterId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldName, string>>>({});

  const physicalHazard = categories.find((item) => String(item.id) === categoryId)?.name === "Physical Hazard";
  const selectedReporter = reporters.find((reporter) => reporter.id === reporterId);
  const visibleReporters = useMemo(() => {
    const query = reporterQuery.trim().toLowerCase();
    return reporters.filter((reporter) => !query || `${reporter.fullName} ${reporter.email}`.toLowerCase().includes(query));
  }, [reporterQuery, reporters]);

  useEffect(() => {
    if (!open) return;
    setLoading(true); setError("");
    void Promise.all([
      api<{ categories: Option[]; locations: Option[] }>("/api/tickets/metadata"),
      api<{ reporters: Reporter[] }>("/api/technician/reporters"),
    ]).then(([metadata, reporterData]) => {
      setCategories(metadata.categories); setLocations(metadata.locations); setReporters(reporterData.reporters);
    }).catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load ticket options"))
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => { if (physicalHazard) setPriority("CRITICAL"); }, [physicalHazard]);
  function clearError(field: FieldName) { setFieldErrors((current) => ({ ...current, [field]: undefined })); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget; const data = new FormData(form);
    const title = String(data.get("title") ?? "").trim();
    const description = String(data.get("description") ?? "").trim();
    const next: Partial<Record<FieldName, string>> = {};
    if (!reporterId) next.reporterId = "Select an existing reporter or requester.";
    if (!categoryId) next.categoryId = "Select a category.";
    if (!priority) next.priority = "Select a priority.";
    if (title.length < 5) next.title = "Enter an issue summary of at least 5 characters.";
    if (description.length < 10) next.description = "Enter a detailed description of at least 10 characters.";
    setFieldErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true); setError("");
    try {
      const result = await api<{ ticket: TicketSummary }>("/api/technician/manual-tickets", { method: "POST", body: JSON.stringify({
        reporterId, categoryId: Number(categoryId),
        locationId: data.get("locationId") ? Number(data.get("locationId")) : null,
        locationDetails: String(data.get("locationDetails") ?? ""), stationReference: String(data.get("stationReference") ?? ""),
        title, description, priority: physicalHazard ? "CRITICAL" : priority,
      }) });
      setOpen(false); form.reset(); setReporterId(""); setReporterQuery(""); setCategoryId(""); setPriority("MEDIUM");
      await onCreated(result.ticket);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Ticket creation failed"); }
    finally { setSaving(false); }
  }

  return <>
    <Button className="bg-[#4B2C70] text-white hover:bg-[#3d235d]" onClick={() => setOpen(true)}><Plus /> Add ticket</Button>
    <Dialog open={open} onOpenChange={(next) => !saving && setOpen(next)}><DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl"><form onSubmit={submit} noValidate>
      <DialogHeader><DialogTitle>Add a new ticket</DialogTitle><DialogDescription>Create a walk-in request for an existing NWU student or staff member. System fields are generated automatically.</DialogDescription></DialogHeader>
      {loading ? <div className="flex min-h-64 items-center justify-center"><LoaderCircle className="size-7 animate-spin text-[#4B2C70]" /></div> : <div className="grid gap-4 py-5 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2"><Label htmlFor="requester-search">Reporter/requester</Label><div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="requester-search" value={reporterQuery} onChange={(event) => { setReporterQuery(event.target.value); setReporterId(""); clearError("reporterId"); }} className="pl-9" placeholder="Search by name or NWU email" aria-invalid={Boolean(fieldErrors.reporterId)} /></div>
          {selectedReporter && <p className="text-sm text-emerald-700">Selected: {selectedReporter.fullName} · {selectedReporter.email}</p>}
          {!selectedReporter && reporterQuery && <div className="max-h-40 overflow-y-auto rounded-lg border bg-white p-1">{visibleReporters.length ? visibleReporters.slice(0, 10).map((reporter) => <button key={reporter.id} type="button" className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-purple-50" onClick={() => { setReporterId(reporter.id); setReporterQuery(`${reporter.fullName} · ${reporter.email}`); clearError("reporterId"); }}><span className="font-medium">{reporter.fullName}</span><span className="ml-2 text-muted-foreground">{reporter.email}</span></button>) : <p className="px-3 py-2 text-sm text-muted-foreground">No matching reporter found.</p>}</div>}<FieldError message={fieldErrors.reporterId} /></div>
        <Field label="Category" htmlFor="new-category"><select id="new-category" value={categoryId} onChange={(event) => { setCategoryId(event.target.value); clearError("categoryId"); }} className={selectClasses} aria-invalid={Boolean(fieldErrors.categoryId)}><option value="">Select a category</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><FieldError message={fieldErrors.categoryId} /></Field>
        <Field label="Priority" htmlFor="new-priority"><select id="new-priority" value={priority} onChange={(event) => { setPriority(event.target.value); clearError("priority"); }} className={selectClasses} disabled={physicalHazard} aria-invalid={Boolean(fieldErrors.priority)}><option value="">Select a priority</option><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="CRITICAL">Critical</option></select><FieldError message={fieldErrors.priority} /></Field>
        {physicalHazard && <div className="flex gap-3 rounded-lg bg-red-50 p-3 text-sm text-red-800 sm:col-span-2"><ShieldAlert className="mt-0.5 size-5 shrink-0" /><p>Priority is Critical. If there is burning, exposed wiring, or an electrical hazard, switch off equipment only if safe, keep people away, and contact emergency or facilities support immediately.</p></div>}
        <Field label="Campus location" htmlFor="new-location"><select id="new-location" name="locationId" className={selectClasses} defaultValue=""><option value="">Select a known location</option>{locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Location details" htmlFor="new-location-details"><Input id="new-location-details" name="locationDetails" placeholder="For example: Lab G14" maxLength={200} /></Field>
        <Field label="Station or asset ID" htmlFor="new-station"><Input id="new-station" name="stationReference" placeholder="For example: Station 12" maxLength={50} /></Field><div className="hidden sm:block" />
        <div className="space-y-2 sm:col-span-2"><Label htmlFor="new-title">Issue summary</Label><Input id="new-title" name="title" maxLength={160} onChange={() => clearError("title")} aria-invalid={Boolean(fieldErrors.title)} /><FieldError message={fieldErrors.title} /></div>
        <div className="space-y-2 sm:col-span-2"><Label htmlFor="new-description">Detailed issue description</Label><Textarea id="new-description" name="description" className="min-h-28" maxLength={4000} onChange={() => clearError("description")} aria-invalid={Boolean(fieldErrors.description)} /><FieldError message={fieldErrors.description} /></div>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2" role="alert">{error}</p>}
      </div>}
      <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button><Button type="submit" className="bg-[#4B2C70] text-white hover:bg-[#3d235d]" disabled={saving || loading}>{saving ? <LoaderCircle className="animate-spin" /> : <Plus />}{saving ? "Creating..." : "Create ticket"}</Button></DialogFooter>
    </form></DialogContent></Dialog>
  </>;
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) { return <div className="space-y-2"><Label htmlFor={htmlFor}>{label}</Label>{children}</div>; }
function FieldError({ message }: { message?: string }) { return message ? <p className="text-xs text-red-600" role="alert">{message}</p> : null; }
const selectClasses = "h-10 w-full rounded-lg border border-input bg-white px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50 disabled:bg-slate-100";
