import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Inbox, LoaderCircle, Plus, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { departments } from "@/lib/departments";

type Category = {
  id: number;
  name: string;
};

type Ticket = {
  id: string;
  ticketNumber: string;
  title: string;
  category: string;
  priority: string;
  status: string;
  department: string | null;
  locationDetails: string | null;
  stationReference: string | null;
  createdAt: string;
};

const selectClasses =
  "h-10 w-full rounded-lg border border-input bg-white px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50";

export function ReporterDashboard() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [metadataResponse, ticketsResponse] = await Promise.all([
        fetch("/api/tickets/metadata", { credentials: "include" }),
        fetch("/api/tickets/mine", { credentials: "include" }),
      ]);

      if (!metadataResponse.ok || !ticketsResponse.ok) {
        throw new Error("Could not load ticket information");
      }

      const metadata = await metadataResponse.json();
      const ticketData = await ticketsResponse.json();

      setCategories(metadata.categories);
      setTickets(ticketData.tickets);
    } catch {
      setError("Could not load your ticket information.");
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
      const response = await fetch("/api/tickets", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          categoryId: Number(formData.get("categoryId")),
          department: String(formData.get("department") ?? "") || null,
          locationDetails: String(formData.get("locationDetails") ?? ""),
          stationReference: String(formData.get("stationReference") ?? ""),
          title: String(formData.get("title") ?? ""),
          description: String(formData.get("description") ?? ""),
          priority: String(formData.get("priority") ?? ""),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error ?? "Ticket submission failed.");
        return;
      }

      form.reset();
      setSuccess(
        `${result.ticket.ticketNumber} was submitted successfully.`,
      );

      await loadData();
    } catch {
      setError("The server could not be reached.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-8 grid gap-8 xl:grid-cols-[420px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Log a new fault</CardTitle>
          <CardDescription>
            Provide enough detail for the technician to locate and diagnose the
            problem.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form className="space-y-4" onSubmit={createTicket}>
            <div className="space-y-2">
              <Label htmlFor="categoryId">Category</Label>
              <select
                id="categoryId"
                name="categoryId"
                className={selectClasses}
                defaultValue=""
                required
              >
                <option value="" disabled>
                  Select a category
                </option>

                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">Urgency</Label>
              <select
                id="priority"
                name="priority"
                className={selectClasses}
                defaultValue="MEDIUM"
                required
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical or hazardous</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="department">Department</Label>
              <select
                id="department"
                name="department"
                className={selectClasses}
                defaultValue=""
              >
                <option value="">Select department</option>
                {departments.map((department) => (
                  <option key={department} value={department}>{department}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="locationDetails">Location</Label>
              <Input
                id="locationDetails"
                name="locationDetails"
                placeholder="For example: Lab G14"
                maxLength={200}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="stationReference">
                Station or equipment number
              </Label>
              <Input
                id="stationReference"
                name="stationReference"
                placeholder="For example: Station 12"
                maxLength={50}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">Short title</Label>
              <Input
                id="title"
                name="title"
                placeholder="Briefly describe the problem"
                minLength={5}
                maxLength={160}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Issue description</Label>
              <Textarea
                id="description"
                name="description"
                className="min-h-28"
                placeholder="Explain what happened, when it started, and any troubleshooting already attempted."
                minLength={10}
                maxLength={4000}
                required
              />
            </div>

            {error && (
              <p
                className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
                role="alert"
              >
                {error}
              </p>
            )}

            {success && (
              <p
                className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
                role="status"
              >
                {success}
              </p>
            )}

            <Button
              type="submit"
              className="h-10 w-full bg-[#4B2C70] text-white hover:bg-[#3d235d]"
              disabled={submitting || categories.length === 0}
            >
              {submitting ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Plus />
              )}
              {submitting ? "Submitting..." : "Submit ticket"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between">
          <div>
            <CardTitle>My tickets</CardTitle>
            <CardDescription>
              Track the status of requests you have submitted.
            </CardDescription>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadData()}
            disabled={loading}
          >
            <RefreshCw className={loading ? "animate-spin" : ""} />
            Refresh
          </Button>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="flex min-h-48 items-center justify-center">
              <LoaderCircle className="size-7 animate-spin text-[#4B2C70]" />
            </div>
          ) : tickets.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center text-center">
              <Inbox className="size-10 text-slate-300" />
              <p className="mt-4 font-medium">No tickets yet</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Submit your first support request using the form.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {tickets.map((ticket) => (
                <article
                  key={ticket.id}
                  className="rounded-xl border bg-white p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-[#4B2C70]">
                        {ticket.ticketNumber}
                      </p>
                      <h2 className="mt-1 font-medium">{ticket.title}</h2>
                    </div>

                    <StatusBadge status={ticket.status} />
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Badge variant="outline">{ticket.category}</Badge>
                    <Badge
                      variant={
                        ticket.priority === "CRITICAL" ||
                        ticket.priority === "HIGH"
                          ? "destructive"
                          : "secondary"
                      }
                    >
                      {formatValue(ticket.priority)}
                    </Badge>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
                    {ticket.department && <span>Department: {ticket.department}</span>}
                    {ticket.locationDetails && (
                      <span>{ticket.locationDetails}</span>
                    )}

                    {ticket.stationReference && (
                      <span>{ticket.stationReference}</span>
                    )}

                    <time dateTime={ticket.createdAt}>
                      {new Date(ticket.createdAt).toLocaleString()}
                    </time>
                  </div>
                </article>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const className =
    status === "RESOLVED"
      ? "bg-emerald-100 text-emerald-800"
      : status === "IN_PROGRESS"
        ? "bg-amber-100 text-amber-800"
        : status === "ESCALATED"
          ? "bg-red-100 text-red-800"
          : "bg-purple-100 text-purple-800";

  return <Badge className={className}>{formatValue(status)}</Badge>;
}

function formatValue(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
