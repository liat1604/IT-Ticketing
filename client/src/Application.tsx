import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { BarChart3, BookOpen, BriefcaseBusiness, CalendarDays, ClipboardList, Download, Gauge, HelpCircle, History, LoaderCircle, LogOut, Menu, Settings, ShieldCheck, UsersRound, Wrench, X } from "lucide-react";

import { api, formatValue } from "@/lib/api";
import type { PortalSection, User } from "@/types";
import { AdminDashboard } from "@/components/admin-dashboard";
import { CalendarDashboard } from "@/components/calendar-dashboard";
import { ReporterPortal } from "@/components/reporter-portal";
import { TechnicianDashboard } from "@/components/technician-dashboard";
import { JobCardsDashboard } from "@/components/job-cards-dashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type NavigationItem = { id: PortalSection; label: string; icon: typeof Gauge; badge?: number };

export default function Application() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [section, setSection] = useState<PortalSection>("overview");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeJobCards, setActiveJobCards] = useState(0);

  useEffect(() => {
    api<{ user: User }>("/api/auth/me").then((result) => setUser(result.user)).catch(() => undefined).finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    if (!user || user.role === "REPORTER") return;
    const load = () => void api<{ active: number }>("/api/job-cards/summary").then((result) => setActiveJobCards(result.active)).catch(() => undefined);
    load(); const timer = window.setInterval(load, 30_000); return () => window.clearInterval(timer);
  }, [user]);

  async function logout() {
    try { await api("/api/auth/logout", { method: "POST" }); } finally { setUser(null); setSection("overview"); }
  }

  if (checking) return <main className="flex min-h-screen items-center justify-center bg-slate-50"><LoaderCircle className="size-8 animate-spin text-[#4B2C70]" aria-label="Checking session" /></main>;
  if (!user) return <AuthenticationPage onAuthenticated={setUser} />;

  const navigation = navigationFor(user, activeJobCards);
  function navigate(next: PortalSection) { setSection(next); setMobileOpen(false); }

  return <div className="min-h-screen bg-[#f7f8fa] lg:grid lg:grid-cols-[264px_minmax(0,1fr)]">
    <aside className={`z-30 border-r border-white/10 bg-[#4B2C70] text-white lg:sticky lg:top-0 lg:h-screen ${mobileOpen ? "fixed inset-0" : "hidden lg:flex"} flex-col`}>
      <div className="flex items-center justify-between border-b border-white/10 px-6 py-6"><div className="flex items-center gap-3"><img src="/ticket-logo.png?v=2" alt="CSIS IT Support logo" className="size-10 rounded-full object-contain" /><div><p className="font-semibold">CSIS IT Support</p><p className="text-xs text-purple-200">Ticket and Log System</p></div></div><Button size="icon" variant="ghost" className="text-white hover:bg-white/10 lg:hidden" onClick={() => setMobileOpen(false)}><X /></Button></div>
      <nav className="flex-1 space-y-1 px-3 py-6" aria-label="Portal navigation">{navigation.map((item) => { const Icon = item.icon; const active = section === item.id; return <button key={item.id} onClick={() => navigate(item.id)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition ${active ? "bg-white text-[#4B2C70] shadow-sm" : "text-purple-100 hover:bg-white/10 hover:text-white"}`}><Icon className="size-4.5" /><span className="flex-1">{item.label}</span>{item.badge ? <span className={`rounded-full px-2 py-0.5 text-xs ${active ? "bg-purple-100" : "bg-white/15 text-white"}`}>{item.badge}</span> : null}</button>; })}</nav>
      <div className="border-t border-white/10 p-4"><div className="rounded-xl bg-white/10 p-3"><p className="truncate text-sm font-medium">{user.fullName}</p><p className="mt-0.5 truncate text-xs text-purple-200">{user.email}</p><Badge className="mt-2 bg-white/15 text-white">{formatValue(user.role)}</Badge></div><Button variant="ghost" className="mt-2 w-full justify-start text-purple-100 hover:bg-white/10 hover:text-white" onClick={() => void logout()}><LogOut /> Sign out</Button></div>
    </aside>
    <div className="min-w-0">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b bg-white/95 px-4 py-3 backdrop-blur sm:px-6 lg:px-8"><div className="flex items-center gap-3"><Button size="icon" variant="outline" className="lg:hidden" onClick={() => setMobileOpen(true)}><Menu /></Button><div><p className="text-sm font-semibold">{pageTitle(section, user)}</p><p className="hidden text-xs text-muted-foreground sm:block">Secure {formatValue(user.role)} portal</p></div></div><div className="flex items-center gap-2"><span className="hidden text-sm text-muted-foreground md:block">{user.fullName}</span><div className="flex size-9 items-center justify-center rounded-full bg-purple-100 text-sm font-semibold text-[#4B2C70]">{initials(user.fullName)}</div></div></header>
      <main className="mx-auto max-w-[1500px] p-4 sm:p-6 lg:p-8">
        {(user.role === "REPORTER" || user.role === "TECHNICIAN") && <div className="mb-7"><p className="text-sm font-medium uppercase tracking-[0.16em] text-[#4B2C70]">{user.role === "REPORTER" ? "Reporter portal" : "Technician workspace"}</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">{section === "overview" ? `Welcome, ${user.fullName.split(" ")[0]}` : pageTitle(section, user)}</h1><p className="mt-1 text-sm text-muted-foreground">{section === "calendar" ? "Coordinate service commitments and visits." : user.role === "REPORTER" ? "Report faults and follow every update through to resolution." : "Prioritise requests, record work and keep requesters informed."}</p></div>}
        <PortalContent user={user} section={section} onJobCardsChanged={setActiveJobCards} />
      </main>
    </div>
  </div>;
}

function PortalContent({ user, section, onJobCardsChanged }: { user: User; section: PortalSection; onJobCardsChanged: (count: number) => void }) {
  if (user.role === "REPORTER") return <ReporterPortal section={section === "tickets" ? "tickets" : "overview"} />;
  if (section === "job-cards") return <JobCardsDashboard user={user} onActiveCountChange={onJobCardsChanged} />;
  if ((user.role === "TECHNICIAN") && section === "calendar") return <CalendarDashboard userId={user.id} role={user.role} />;
  if (user.role === "TECHNICIAN") return <TechnicianDashboard userId={user.id} userRole={user.role} />;
  if (section === "calendar") return <CalendarDashboard userId={user.id} role={user.role} />;
  return <AdminDashboard section={section} user={user} />;
}

function navigationFor(user: User, activeJobCards: number): NavigationItem[] {
  if (user.role === "REPORTER") return [{ id: "overview", label: "Overview", icon: Gauge }, { id: "tickets", label: "My tickets", icon: ClipboardList }];
  if (user.role === "TECHNICIAN") return [{ id: "overview", label: "Overview", icon: Gauge }, { id: "tickets", label: "Ticket queue", icon: Wrench }, { id: "job-cards", label: "Job cards", icon: BriefcaseBusiness, badge: activeJobCards }, { id: "calendar", label: "Calendar", icon: CalendarDays }];
  return [
    { id: "overview", label: "Overview", icon: Gauge }, { id: "tickets", label: "Tickets", icon: ClipboardList }, { id: "job-cards", label: "Job cards", icon: BriefcaseBusiness, badge: activeJobCards },
    { id: "calendar", label: "Calendar", icon: CalendarDays }, { id: "reports", label: "Reports", icon: BarChart3 },
    { id: "users", label: "Users & roles", icon: UsersRound }, { id: "audit", label: "Audit trail", icon: History },
    ...(user.role === "SYSTEM_ADMIN" ? [{ id: "system" as PortalSection, label: "System", icon: Settings }] : []),
  ];
}

function pageTitle(section: PortalSection, user: User) {
  const labels: Record<PortalSection, string> = { overview: user.role === "REPORTER" ? "My support overview" : "Service overview", tickets: user.role === "REPORTER" ? "My tickets" : "Ticket management", "job-cards": "Technician job cards", calendar: "Service calendar", reports: "Reports and analytics", users: "Users and permissions", audit: "Audit trail", system: "System administration" };
  return labels[section];
}

function AuthenticationPage({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login"); const [submitting, setSubmitting] = useState(false); const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setSubmitting(true); setError(""); const data = new FormData(event.currentTarget); const body = mode === "register" ? { fullName: data.get("fullName"), email: data.get("email"), password: data.get("password") } : { email: data.get("email"), password: data.get("password") }; try { onAuthenticated((await api<{ user: User }>(`/api/auth/${mode}`, { method: "POST", body: JSON.stringify(body) })).user); } catch (caught) { setError(caught instanceof Error ? caught.message : "Authentication failed"); } finally { setSubmitting(false); } }
  return <main className="grid min-h-screen lg:grid-cols-2"><section className="hidden bg-[#4B2C70] p-12 text-white lg:flex lg:flex-col lg:justify-between"><div className="flex items-center gap-3"><img src="/ticket-logo.png?v=2" alt="CSIS IT Support logo" className="size-12 rounded-full object-contain" /><div><p className="font-semibold">CSIS IT Support</p><p className="text-sm text-purple-200">North-West University</p></div></div><div className="max-w-lg"><p className="text-sm font-medium uppercase tracking-[0.2em] text-purple-200">One place for every request</p><h1 className="mt-4 text-4xl font-semibold leading-tight">From fault report to resolution, every action is visible and accountable.</h1><p className="mt-5 text-lg leading-8 text-purple-100">A secure support portal for CSIS students, staff, technicians and administrators.</p></div><div className="flex items-center gap-2 text-sm text-purple-200"><ShieldCheck className="size-4" /> Authorised NWU access</div></section>
    <section className="flex items-center justify-center bg-slate-50 p-4 sm:p-6"><div className="w-full max-w-lg space-y-4 py-4"><Card><CardHeader><img src="/ticket-logo.png?v=2" alt="CSIS IT Support logo" className="mb-3 size-11 rounded-full self-start object-contain lg:hidden" /><CardTitle className="text-2xl">{mode === "login" ? "Welcome back" : "Create reporter account"}</CardTitle><CardDescription>{mode === "login" ? "Sign in using your @mynwu.ac.za email address." : "Register to submit and track CSIS support requests."}</CardDescription></CardHeader><CardContent><div className="mb-6 grid grid-cols-2 rounded-lg bg-slate-100 p-1"><ModeButton active={mode === "login"} onClick={() => { setMode("login"); setError(""); }}>Sign in</ModeButton><ModeButton active={mode === "register"} onClick={() => { setMode("register"); setError(""); }}>Register</ModeButton></div><form className="space-y-4" onSubmit={submit}>{mode === "register" && <Field label="Full name" htmlFor="fullName"><Input id="fullName" name="fullName" autoComplete="name" required /></Field>}<Field label="NWU email address" htmlFor="email"><Input id="email" name="email" type="email" autoComplete="email" placeholder="name@mynwu.ac.za" required /></Field><Field label="Password" htmlFor="password"><Input id="password" name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "register" ? 12 : undefined} required />{mode === "register" && <p className="text-xs text-muted-foreground">At least 12 characters with uppercase, lowercase and a number.</p>}</Field>{error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}<Button type="submit" className="h-10 w-full bg-[#4B2C70] text-white hover:bg-[#3d235d]" disabled={submitting}>{submitting && <LoaderCircle className="animate-spin" />}{submitting ? "Please wait..." : mode === "login" ? "Sign in" : "Create account"}</Button></form></CardContent></Card><LoginHelp /></div></section>
  </main>;
}

const loginFaq = [
  { question: "Who can register?", answer: "Students and staff with a valid @mynwu.ac.za email address can create a reporter account. Technician and administrator accounts are created by an administrator." },
  { question: "How do I report a fault?", answer: "Register or sign in, choose the category and urgency, identify the location or station, and describe the issue and any troubleshooting already attempted." },
  { question: "Where can I track progress?", answer: "Open My tickets after signing in to view status, comments, technician updates, recorded work, escalation details, and the final resolution." },
  { question: "What counts as a critical issue?", answer: "Use Critical for serious service impact or physical hazards such as smoke, exposed wiring, overheating equipment, or electrical danger." },
];

function LoginHelp() {
  return <Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><HelpCircle className="size-5 text-[#4B2C70]" /> Help and onboarding</CardTitle><CardDescription>Quick answers before you sign in.</CardDescription></CardHeader><CardContent className="space-y-3">{loginFaq.map((item) => <details key={item.question} className="group rounded-lg border bg-white px-4 py-3"><summary className="cursor-pointer list-none text-sm font-medium text-slate-900 marker:hidden"><span className="flex items-center justify-between gap-3">{item.question}<span className="text-[#4B2C70] transition group-open:rotate-45">+</span></span></summary><p className="mt-2 text-sm leading-6 text-muted-foreground">{item.answer}</p></details>)}<a href="/api/resources/user-guide" download="csis-it-support-user-guide.pdf" className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#4B2C70] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#3d235d]"><Download className="size-4" /> Download user guide (PDF)</a><p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground"><BookOpen className="size-3.5" /> Includes reporter, technician, administrator, workflow, and FAQ guidance.</p></CardContent></Card>;
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) { return <div className="space-y-2"><Label htmlFor={htmlFor}>{label}</Label>{children}</div>; }
function ModeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) { return <Button type="button" variant={active ? "default" : "ghost"} className={active ? "bg-[#4B2C70] text-white hover:bg-[#3d235d]" : ""} onClick={onClick}>{children}</Button>; }
function initials(name: string) { return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }
