import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { LoaderCircle, Plus, ShieldAlert } from "lucide-react";

import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
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
import { departments } from "@/lib/departments";

type Option = { id: number; name: string };
type Reporter = { id: string; fullName: string; email: string };

export function ManualTicketDialog({ onCreated }: { onCreated: (message: string) => void | Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [categories, setCategories] = useState<Option[]>([]);
  const [reporters, setReporters] = useState<Reporter[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError("");

    void Promise.all([
      api<{ categories: Option[] }>("/api/tickets/metadata"),
      api<{ reporters: Reporter[] }>("/api/technician/reporters"),
    ])
      .then(([metadata, reporterData]) => {
        setCategories(metadata.categories);
        setReporters(reporterData.reporters);
      })
      .catch((caughtError: unknown) => {
        setError(caughtError instanceof Error ? caughtError.message : "Could not load ticket options");
      })
      .finally(() => setLoading(false));
  }, [open]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setSaving(true);
    setError("");

    try {
      const result = await api<{ ticket: { ticketNumber: string } }>("/api/technician/manual-tickets", {
        method: "POST",
        body: JSON.stringify({
          reporterId: String(data.get("reporterId") ?? ""),
          categoryId: Number(data.get("categoryId")),
          department: String(data.get("department") ?? "") || null,
          locationDetails: String(data.get("locationDetails") ?? ""),
          stationReference: String(data.get("stationReference") ?? ""),
          title: String(data.get("title") ?? ""),
          description: String(data.get("description") ?? ""),
          priority: String(data.get("priority") ?? "MEDIUM"),
        }),
      });
      setOpen(false);
      form.reset();
      await onCreated(`${result.ticket.ticketNumber} was created as a walk-in ticket.`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not create walk-in ticket");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} className="bg-[#00899A] text-white hover:bg-[#007483]">
        <Plus /> New ticket
      </Button>
      <Dialog open={open} onOpenChange={(nextOpen) => !saving && setOpen(nextOpen)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>Log a walk-in ticket</DialogTitle>
              <DialogDescription>Create a request on behalf of an existing student or staff reporter.</DialogDescription>
            </DialogHeader>

            {loading ? (
              <div className="flex min-h-64 items-center justify-center"><LoaderCircle className="size-7 animate-spin text-[#4B2C70]" /></div>
            ) : (
              <div className="grid gap-4 py-5 sm:grid-cols-2">
                <Field label="Reporter" span>
                  <select name="reporterId" className={selectClasses} defaultValue="" required>
                    <option value="" disabled>Select a reporter</option>
                    {reporters.map((reporter) => <option key={reporter.id} value={reporter.id}>{reporter.fullName} · {reporter.email}</option>)}
                  </select>
                </Field>
                <Field label="Category">
                  <select name="categoryId" className={selectClasses} defaultValue="" required>
                    <option value="" disabled>Select category</option>
                    {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                  </select>
                </Field>
                <Field label="Priority">
                  <select name="priority" className={selectClasses} defaultValue="MEDIUM" required>
                    <option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="CRITICAL">Critical</option>
                  </select>
                </Field>
                <Field label="Department">
                  <select name="department" className={selectClasses} defaultValue="">
                    <option value="">Select department</option>
                    {departments.map((department) => <option key={department} value={department}>{department}</option>)}
                  </select>
                </Field>
                <Field label="Building, room, or area"><Input name="locationDetails" placeholder="Lab, office, or floor" maxLength={200} /></Field>
                <Field label="Station or asset ID"><Input name="stationReference" placeholder="Station 12" maxLength={50} /></Field>
                <Field label="Issue summary" span><Input name="title" minLength={5} maxLength={160} required /></Field>
                <Field label="Issue description" span><Textarea name="description" className="min-h-28" minLength={10} maxLength={4000} required /></Field>
                {error && <p className="sm:col-span-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
              <Button type="submit" disabled={saving || loading} className="bg-[#4B2C70] text-white hover:bg-[#3d235d]">
                {saving ? <LoaderCircle className="animate-spin" /> : <Plus />}
                {saving ? "Creating..." : "Create ticket"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function EscalateTicketDialog({
  ticket,
  onEscalated,
}: {
  ticket: { id: string; ticketNumber: string; title: string };
  onEscalated: (message: string) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setSaving(true);
    setError("");

    try {
      await api(`/api/technician/${ticket.id}/escalate`, {
        method: "POST",
        body: JSON.stringify({
          reason: String(data.get("reason") ?? ""),
          externalReference: String(data.get("externalReference") ?? ""),
        }),
      });
      setOpen(false);
      await onEscalated(`${ticket.ticketNumber} was escalated to NWU Central IT.`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not escalate ticket");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button type="button" variant="outline" className="w-full text-red-700" onClick={() => setOpen(true)}>
        <ShieldAlert /> Escalate
      </Button>
      <Dialog open={open} onOpenChange={(nextOpen) => !saving && setOpen(nextOpen)}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>Escalate {ticket.ticketNumber}</DialogTitle>
              <DialogDescription>Record the formal hand-off of “{ticket.title}” to NWU Central IT.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-5">
              <div className="space-y-2"><Label htmlFor={`reason-${ticket.id}`}>Escalation reason</Label><Textarea id={`reason-${ticket.id}`} name="reason" className="min-h-28" minLength={10} maxLength={2000} required /></div>
              <div className="space-y-2"><Label htmlFor={`reference-${ticket.id}`}>NWU Central IT reference</Label><Input id={`reference-${ticket.id}`} name="externalReference" placeholder="Optional service desk reference" maxLength={120} /></div>
              {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
              <Button type="submit" variant="destructive" disabled={saving}>{saving ? <LoaderCircle className="animate-spin" /> : <ShieldAlert />}{saving ? "Escalating..." : "Confirm escalation"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({ label, span = false, children }: { label: string; span?: boolean; children: ReactNode }) {
  return <div className={span ? "space-y-2 sm:col-span-2" : "space-y-2"}><Label>{label}</Label>{children}</div>;
}

const selectClasses = "h-10 w-full rounded-lg border border-input bg-white px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50";
