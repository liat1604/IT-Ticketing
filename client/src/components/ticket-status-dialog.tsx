import { useState, type FormEvent } from "react";
import { CheckCircle2, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type TicketStatusDialogProps = {
  ticket: {
    id: string;
    ticketNumber: string;
    title: string;
    activeTimerStartedAt: string | null;
  };
  onUpdated: (message: string) => void | Promise<void>;
};

export function TicketStatusDialog({ ticket, onUpdated }: TicketStatusDialogProps) {
  const [open, setOpen] = useState(false);
  const [resolutionSummary, setResolutionSummary] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function openDialog() {
    setResolutionSummary("");
    setError("");
    setOpen(true);
  }

  async function resolveTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const summary = resolutionSummary.trim();
    if (summary.length < 10) {
      setError("Enter a resolution summary of at least 10 characters.");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch(`/api/technician/${ticket.id}/status`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "RESOLVED", resolutionSummary: summary }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "Could not resolve this ticket.");
      }

      setOpen(false);
      await onUpdated(`${ticket.ticketNumber} was resolved successfully.`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not resolve this ticket.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button type="button" variant="outline" className="w-full" onClick={openDialog}>
        <CheckCircle2 />
        Resolve ticket
      </Button>

      <Dialog open={open} onOpenChange={(nextOpen) => !saving && setOpen(nextOpen)}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={resolveTicket}>
            <DialogHeader>
              <DialogTitle>Resolve {ticket.ticketNumber}</DialogTitle>
              <DialogDescription>
                Record how “{ticket.title}” was resolved.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2 py-5">
              <Label htmlFor="resolution-summary">Resolution summary</Label>
              <Textarea
                id="resolution-summary"
                value={resolutionSummary}
                onChange={(event) => setResolutionSummary(event.target.value)}
                placeholder="Explain what was fixed and how it was verified."
                rows={5}
                minLength={10}
                maxLength={2000}
                required
                disabled={saving}
                aria-invalid={resolutionSummary.length > 0 && resolutionSummary.trim().length < 10}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Minimum 10 characters</span>
                <span>{resolutionSummary.length}/2000</span>
              </div>
              {ticket.activeTimerStartedAt && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Resolving this ticket will stop its active timer.
                </p>
              )}
              {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving || resolutionSummary.trim().length < 10} className="bg-emerald-700 text-white hover:bg-emerald-800">
                {saving ? <LoaderCircle className="animate-spin" /> : <CheckCircle2 />}
                {saving ? "Resolving..." : "Resolve ticket"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
