import { useState, type FormEvent } from "react";
import {
  CheckCircle2,
  ClipboardCheck,
  LoaderCircle,
} from "lucide-react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type TicketStatus =
  | "IN_PROGRESS"
  | "AWAITING_FEEDBACK"
  | "RESOLVED";

type TicketStatusDialogProps = {
  ticket: {
    id: string;
    ticketNumber: string;
    title: string;
    status: string;
    activeTimerStartedAt: string | null;
  };
  onUpdated: (message: string) => void | Promise<void>;
};

const statusOptions: Record<TicketStatus, string> = {
  IN_PROGRESS: "In Progress",
  AWAITING_FEEDBACK: "Awaiting Feedback",
  RESOLVED: "Resolved",
};

export function TicketStatusDialog({
  ticket,
  onUpdated,
}: TicketStatusDialogProps) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] =
    useState<TicketStatus>("IN_PROGRESS");
  const [resolutionSummary, setResolutionSummary] =
    useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function openDialog() {
    const currentStatus: TicketStatus =
      ticket.status === "AWAITING_FEEDBACK"
        ? "AWAITING_FEEDBACK"
        : "IN_PROGRESS";

    setStatus(currentStatus);
    setResolutionSummary("");
    setError("");
    setOpen(true);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!saving) {
      setOpen(nextOpen);
    }
  }

  async function updateStatus(event: FormEvent) {
    event.preventDefault();
    setError("");

    if (
      status === "RESOLVED" &&
      resolutionSummary.trim().length < 10
    ) {
      setError(
        "Enter a resolution summary of at least 10 characters.",
      );
      return;
    }

    setSaving(true);

    try {
      const response = await fetch(
        `/api/technician/${ticket.id}/status`,
        {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status,
            resolutionSummary:
              status === "RESOLVED"
                ? resolutionSummary.trim()
                : undefined,
          }),
        },
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ?? "Could not update ticket status.",
        );
      }

      setOpen(false);

      await onUpdated(
        status === "RESOLVED"
          ? `${ticket.ticketNumber} was resolved successfully.`
          : `${ticket.ticketNumber} was changed to ${statusOptions[status]}.`,
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not update ticket status.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={openDialog}
      >
        <ClipboardCheck />
        Update status
      </Button>

      <Dialog
        open={open}
        onOpenChange={handleOpenChange}
      >
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={updateStatus}>
            <DialogHeader>
              <DialogTitle>
                Update {ticket.ticketNumber}
              </DialogTitle>

              <DialogDescription>
                Change the workflow status for “{ticket.title}”.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5 py-5">
              {error && (
                <p
                  className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
                  role="alert"
                >
                  {error}
                </p>
              )}

              <div className="space-y-2">
                <Label htmlFor="ticket-status">
                  New status
                </Label>

                <Select<TicketStatus>
                  id="ticket-status"
                  items={statusOptions}
                  value={status}
                  onValueChange={(value) => {
                    if (value) {
                      setStatus(value);
                      setError("");
                    }
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>

                  <SelectContent>
                    <SelectItem value="IN_PROGRESS">
                      In Progress
                    </SelectItem>

                    <SelectItem value="AWAITING_FEEDBACK">
                      Awaiting Feedback
                    </SelectItem>

                    <SelectItem value="RESOLVED">
                      Resolved
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {status === "RESOLVED" && (
                <div className="space-y-2">
                  <Label htmlFor="resolution-summary">
                    Resolution summary
                  </Label>

                  <Textarea
                    id="resolution-summary"
                    value={resolutionSummary}
                    onChange={(event) =>
                      setResolutionSummary(
                        event.target.value,
                      )
                    }
                    placeholder="Explain what caused the problem and how it was resolved."
                    rows={5}
                    maxLength={2000}
                    disabled={saving}
                    aria-invalid={
                      resolutionSummary.length > 0 &&
                      resolutionSummary.trim().length < 10
                    }
                  />

                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Minimum 10 characters</span>
                    <span>
                      {resolutionSummary.length}/2000
                    </span>
                  </div>

                  {ticket.activeTimerStartedAt && (
                    <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      Resolving this ticket will automatically
                      stop its active timer.
                    </p>
                  )}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>

              <Button
                type="submit"
                disabled={saving}
                className={
                  status === "RESOLVED"
                    ? "bg-emerald-700 text-white hover:bg-emerald-800"
                    : "bg-[#4B2C70] text-white hover:bg-[#3d235d]"
                }
              >
                {saving ? (
                  <LoaderCircle className="animate-spin" />
                ) : status === "RESOLVED" ? (
                  <CheckCircle2 />
                ) : (
                  <ClipboardCheck />
                )}

                {saving
                  ? "Saving..."
                  : status === "RESOLVED"
                    ? "Resolve ticket"
                    : "Save status"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
