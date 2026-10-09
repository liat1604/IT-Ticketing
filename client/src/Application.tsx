import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, BarChart3, BookOpen, BriefcaseBusiness, CalendarDays, ClipboardList, Download, Eye, EyeOff, Gauge, GraduationCap, HelpCircle, History, LoaderCircle, LogOut, Menu, Settings, ShieldCheck, UsersRound, Wrench, X } from "lucide-react";

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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type NavigationItem = { id: PortalSection; label: string; icon: typeof Gauge; badge?: number };
type SignInAudience = "REPORTER" | "TECHNICIAN" | "ADMIN";
type AuthField = "fullName" | "email" | "password" | "confirmPassword";

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
    <aside className={`portal-sidebar-motion z-30 flex h-dvh flex-col overflow-hidden border-r border-white/10 bg-[#4B2C70] text-white lg:sticky lg:top-0 lg:h-screen ${mobileOpen ? "fixed inset-0" : "hidden lg:flex"}`}>
      <div className="flex items-center justify-between border-b border-white/10 px-6 py-6"><div className="flex items-center gap-3"><img src="/ticket-logo.png?v=2" alt="CSIS IT Support logo" className="size-10 rounded-full object-contain" /><div><p className="font-semibold">CSIS IT Support</p><p className="text-xs text-purple-200">Ticket and Log System</p></div></div><Button size="icon" variant="ghost" className="text-white hover:bg-white/10 lg:hidden" onClick={() => setMobileOpen(false)}><X /></Button></div>
      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-6" aria-label="Portal navigation">{navigation.map((item) => { const Icon = item.icon; const active = section === item.id; return <button key={item.id} onClick={() => navigate(item.id)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition ${active ? "bg-white text-[#4B2C70] shadow-sm" : "text-purple-100 hover:bg-white/10 hover:text-white"}`}><Icon className="size-4.5" /><span className="flex-1">{item.label}</span>{item.badge ? <span className={`rounded-full px-2 py-0.5 text-xs ${active ? "bg-purple-100" : "bg-white/15 text-white"}`}>{item.badge}</span> : null}</button>; })}</nav>
      <div className="shrink-0 border-t border-white/10 p-4"><div className="rounded-xl bg-white/10 p-3"><p className="truncate text-sm font-medium">{user.fullName}</p><p className="mt-0.5 truncate text-xs text-purple-200">{user.email}</p><Badge className="mt-2 bg-white/15 text-white">{formatValue(user.role)}</Badge></div><Button variant="ghost" className="mt-2 h-auto w-full justify-start gap-3 px-3 py-2.5 text-base font-medium text-purple-100 hover:bg-white/10 hover:text-white" onClick={() => void logout()}><LogOut className="size-5" /> Sign out</Button></div>
    </aside>
    <div className="min-w-0">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b bg-white/95 px-4 py-3 backdrop-blur sm:px-6 lg:px-8"><div className="flex items-center gap-3"><Button size="icon" variant="outline" className="lg:hidden" onClick={() => setMobileOpen(true)}><Menu /></Button><div><p className="text-sm font-semibold">{pageTitle(section, user)}</p></div></div><div className="flex items-center gap-2"><span className="hidden text-sm text-muted-foreground md:block">{user.fullName}</span><div className="flex size-9 items-center justify-center rounded-full bg-purple-100 text-sm font-semibold text-[#4B2C70]">{initials(user.fullName)}</div></div></header>
      <main className="mx-auto max-w-[1500px] p-4 sm:p-6 lg:p-8">
        {(user.role === "REPORTER" || user.role === "TECHNICIAN") && <div className="mb-9"><p className="text-sm font-medium uppercase tracking-[0.16em] text-[#4B2C70]">{user.role === "REPORTER" ? "Reporter portal" : "Technician workspace"}</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">{section === "overview" ? `Welcome, ${user.fullName.split(" ")[0]}` : pageTitle(section, user)}</h1></div>}
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
  type AuthMode = "landing" | "loading" | "login" | "register" | "forgot" | "reset" | "verify" | "resend";
  const verifyToken = new URLSearchParams(window.location.search).get("verifyToken") ?? "";
  const resetToken = new URLSearchParams(window.location.search).get("resetToken") ?? "";
  const [mode, setMode] = useState<AuthMode>(verifyToken ? "verify" : resetToken ? "reset" : "landing");
  const [audience, setAudience] = useState<SignInAudience | null>(verifyToken ? "REPORTER" : null);
  const [submitting, setSubmitting] = useState(false);
  const [canResendVerification, setCanResendVerification] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<AuthField, string>>>({});
  const [message, setMessage] = useState("");

  function changeMode(next: AuthMode) { if (next === "landing") setAudience(null); setMode(next); setCanResendVerification(false); setError(""); setFieldErrors({}); setMessage(""); }
  function clearFieldError(field: AuthField) { setFieldErrors((current) => { const next = { ...current }; delete next[field]; return next; }); }
  function chooseAudience(next: SignInAudience) { setAudience(next); setMode("loading"); window.setTimeout(() => setMode("login"), 700); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSubmitting(true); setCanResendVerification(false); setError(""); setFieldErrors({}); setMessage("");
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") ?? "");
    const confirmPassword = String(data.get("confirmPassword") ?? "");
    if (mode === "register") {
      const fullName = String(data.get("fullName") ?? "").trim();
      const email = String(data.get("email") ?? "").trim();
      const emailInput = event.currentTarget.elements.namedItem("email") as HTMLInputElement | null;
      const validationErrors: Partial<Record<AuthField, string>> = {};
      if (!fullName) validationErrors.fullName = "Enter your full name.";
      else if (fullName.length < 2) validationErrors.fullName = "Full name must be at least 2 characters.";
      if (!email) validationErrors.email = "Enter your NWU email address.";
      else if (emailInput?.validity.typeMismatch || !email.toLowerCase().endsWith("@mynwu.ac.za")) validationErrors.email = "Enter a valid email address ending in @mynwu.ac.za.";
      if (!password) validationErrors.password = "Enter a password.";
      else if (password.length < 12 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) validationErrors.password = "Use at least 12 characters with uppercase, lowercase and a number.";
      else if (password.length > 128) validationErrors.password = "Password must be 128 characters or fewer.";
      if (!confirmPassword) validationErrors.confirmPassword = "Confirm your password.";
      else if (password !== confirmPassword) validationErrors.confirmPassword = "Passwords do not match.";
      if (Object.keys(validationErrors).length > 0) { setFieldErrors(validationErrors); setSubmitting(false); return; }
    }
    if (mode === "reset" && password !== confirmPassword) { setFieldErrors({ confirmPassword: "Passwords do not match." }); setSubmitting(false); return; }
    try {
      if (mode === "verify") {
        await api<{ message: string }>("/api/auth/verify-email", { method: "POST", body: JSON.stringify({ token: verifyToken }) });
        window.history.replaceState({}, "", window.location.pathname); changeMode("login"); return;
      }
      if (mode === "resend") {
        const result = await api<{ message: string }>("/api/auth/resend-verification", { method: "POST", body: JSON.stringify({ email: data.get("email") }) });
        setMessage(result.message); return;
      }
      if (mode === "forgot") {
        const result = await api<{ message: string }>("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email: data.get("email") }) });
        setMessage(result.message); return;
      }
      if (mode === "reset") {
        const result = await api<{ message: string }>("/api/auth/reset-password", { method: "POST", body: JSON.stringify({ token: resetToken, password, confirmPassword }) });
        window.history.replaceState({}, "", window.location.pathname); changeMode("login"); setMessage(result.message); return;
      }
      const body = mode === "register" ? { fullName: data.get("fullName"), email: data.get("email"), password, confirmPassword } : { email: data.get("email"), password };
      if (mode === "register") {
        const result = await api<{ message: string }>("/api/auth/register", { method: "POST", body: JSON.stringify(body) });
        changeMode("resend"); setMessage(result.message); return;
      }
      onAuthenticated((await api<{ user: User }>("/api/auth/login", { method: "POST", body: JSON.stringify(body) })).user);
    } catch (caught) {
      const errorMessage = caught instanceof Error ? caught.message : "Authentication failed";
      setError(errorMessage);
      setCanResendVerification(mode === "login" && errorMessage.toLowerCase().includes("verify your email before signing in"));
    }
    finally { setSubmitting(false); }
  }
  if (mode === "landing") return <PortalLanding onChoose={chooseAudience} />;
  if (mode === "loading") return <PortalLoading audience={audience} />;

  const canRegister = audience === "REPORTER" && (mode === "login" || mode === "register");
  const audienceDescription = audience === "REPORTER"
    ? "Sign in with your NWU email to report a fault or follow a support request."
    : audience === "TECHNICIAN"
      ? "Access the technician portal with your NWU account."
      : audience === "ADMIN"
        ? "Access administration tools with your authorised NWU account."
        : "Sign in using your @mynwu.ac.za email address.";
  return <main className="relative isolate flex min-h-dvh items-center justify-center overflow-x-hidden px-4 py-12 sm:px-6">
    <AuthBackdrop />
    <AuthBrand />
    <div className="auth-content-enter relative z-10 w-full max-w-lg">
      <Card className="border-white/60 bg-white/95 text-slate-900 shadow-2xl shadow-[#24113c]/25 backdrop-blur">
        <CardHeader className="relative pr-14">
          {mode === "login" && <LoginHelp />}
          <Button type="button" variant="ghost" className="-ml-3 mb-1 w-fit gap-2 px-3 text-[#4B2C70] hover:bg-purple-50" onClick={() => changeMode("landing")}><ArrowLeft className="size-4" /> Back to role selection</Button>
          <CardTitle className="text-2xl">{mode === "login" ? "Welcome back" : mode === "register" ? "Create reporter account" : mode === "forgot" ? "Forgot your password?" : mode === "verify" ? "Verify your email" : mode === "resend" ? "Resend verification email" : "Choose a new password"}</CardTitle>
          <CardDescription className="text-gray-500">{mode === "login" ? audienceDescription : mode === "register" ? "Register, then verify your email to sign in and submit support requests." : mode === "forgot" ? "Enter your NWU email and we will send a secure reset link." : mode === "verify" ? "Confirm your email address to unlock sign-in and ticket creation." : mode === "resend" ? "Enter your NWU email to receive a verification link. Links expire in 24 hours." : "Your reset link is single-use and expires after 15 minutes."}</CardDescription>
        </CardHeader>
        <CardContent>
          {canRegister && <div className="mb-6 grid grid-cols-2 rounded-lg bg-slate-100 p-1"><ModeButton active={mode === "login"} onClick={() => changeMode("login")}>Sign in</ModeButton><ModeButton active={mode === "register"} onClick={() => changeMode("register")}>Register</ModeButton></div>}
          <form className="space-y-4" onSubmit={submit} noValidate={mode === "register"}>
            {mode === "register" && <Field label="Full name" htmlFor="fullName"><Input id="fullName" name="fullName" autoComplete="name" aria-invalid={Boolean(fieldErrors.fullName)} onChange={() => clearFieldError("fullName")} required />{fieldErrors.fullName && <p className="text-sm text-red-700" role="alert">{fieldErrors.fullName}</p>}</Field>}
            {mode !== "reset" && mode !== "verify" && <Field label="NWU email address" htmlFor="email"><Input id="email" name="email" type="email" autoComplete="email" placeholder="name@mynwu.ac.za" className="border-slate-200 bg-slate-50/50 text-slate-900 placeholder:text-gray-500" aria-invalid={Boolean(fieldErrors.email)} onChange={() => clearFieldError("email")} required />{fieldErrors.email && <p className="text-sm text-red-700" role="alert">{fieldErrors.email}</p>}</Field>}
            {(mode === "login" || mode === "register" || mode === "reset") && <><Field label={mode === "reset" ? "New password" : "Password"} htmlFor="password"><PasswordInput id="password" name="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "login" ? undefined : 12} className="border-slate-200 bg-slate-50/50 text-slate-900 placeholder:text-gray-500" aria-invalid={Boolean(fieldErrors.password)} onChange={() => clearFieldError("password")} required />{mode !== "login" && <p className="text-xs text-muted-foreground">At least 12 characters with uppercase, lowercase and a number.</p>}{fieldErrors.password && <p className="text-sm text-red-700" role="alert">{fieldErrors.password}</p>}</Field>{(mode === "register" || mode === "reset") && <Field label={mode === "reset" ? "Confirm new password" : "Confirm password"} htmlFor="confirmPassword"><PasswordInput id="confirmPassword" name="confirmPassword" autoComplete="new-password" minLength={12} className="border-slate-200 bg-slate-50/50 text-slate-900 placeholder:text-gray-500" required aria-invalid={Boolean(fieldErrors.confirmPassword)} onChange={() => clearFieldError("confirmPassword")} />{fieldErrors.confirmPassword && <p className="text-sm text-red-700" role="alert">{fieldErrors.confirmPassword}</p>}</Field>}</>}
            {mode === "login" && <div className="-mt-1 text-right"><button type="button" className="text-sm font-medium text-[#4B2C70] hover:underline" onClick={() => changeMode("forgot")}>Forgot password?</button></div>}
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
            {message && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700" role="status">{message}</p>}
            <Button type="submit" className="h-10 w-full bg-[#4B2C70] text-white hover:bg-[#3d235d]" disabled={submitting || (mode === "forgot" && Boolean(message))}>{submitting && <LoaderCircle className="animate-spin" />}{submitting ? "Please wait..." : mode === "login" ? "Sign in" : mode === "register" ? "Create account" : mode === "forgot" ? "Send reset link" : mode === "verify" ? "Verify email" : mode === "resend" ? "Send verification link" : "Reset password"}</Button>
            {(mode === "forgot" || mode === "reset" || mode === "resend") && <Button type="button" variant="ghost" className="w-full text-[#4B2C70] hover:bg-purple-50 hover:text-[#3d235d]" onClick={() => changeMode("login")}>Back to sign in</Button>}
            {mode === "login" && canResendVerification && <Button type="button" variant="ghost" className="w-full text-[#4B2C70] hover:bg-purple-50 hover:text-[#3d235d]" disabled={submitting} onClick={() => changeMode("resend")}>Resend verification email</Button>}
          </form>
        </CardContent>
      </Card>
      <p className="mt-5 text-center text-xs text-white/85">© 2026 North-West University · CSIS IT Support</p>
    </div>
  </main>;
}

function AuthBackdrop({
  imageSrc = "/csis-campus-landing.png",
  landing = false,
}: {
  imageSrc?: string;
  landing?: boolean;
}) {
  return <div className="fixed inset-0 -z-10 overflow-hidden bg-[#4B2C70]">
    <img src={imageSrc} alt="" className="absolute inset-0 size-full object-cover object-center" />
    <div className={landing
      ? "absolute inset-0 bg-gradient-to-br from-[#32184f]/55 via-[#4B2C70]/58 to-[#26113e]/72"
      : "absolute inset-0 bg-gradient-to-br from-[#32184f]/80 via-[#4B2C70]/70 to-[#26113e]/85"} />
    <div className={landing
      ? "absolute inset-0 bg-[#4B2C70] opacity-10"
      : "absolute inset-0 bg-[#4B2C70] opacity-20"} />
  </div>;
}

function AuthBrand() {
  return <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-5 py-4 text-white sm:px-8 sm:py-5">
    <div className="flex items-center gap-3"><img src="/ticket-logo.png?v=2" alt="" className="size-10 rounded-full object-contain ring-1 ring-white/40" /><div><p className="font-semibold leading-tight">CSIS IT Support</p><p className="text-xs text-white/75">Ticket and Log System</p></div></div>
    <div className="hidden text-right text-xs font-medium text-white/80 sm:block">North-West University</div>
  </header>;
}

function PortalLanding({ onChoose }: { onChoose: (audience: SignInAudience) => void }) {
  return <main className="relative isolate flex min-h-dvh flex-col overflow-hidden text-white">
    <AuthBackdrop imageSrc="/landing-group-jump.png" landing />
    <AuthBrand />
    <section className="relative z-10 mx-auto my-auto w-full max-w-5xl px-5 pb-10 pt-28 sm:px-8 sm:pt-32">
      <div className="auth-content-enter mx-auto max-w-3xl text-center">
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-purple-100">Secure support for the CSIS community</p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Welcome to CSIS IT Support</h1>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-white/85 sm:text-lg">One place to report a fault, coordinate technical work and follow every update. Choose how you use the portal.</p>
      </div>
      <div className="auth-content-enter mx-auto mt-9 grid max-w-3xl gap-4 sm:grid-cols-2" style={{ animationDelay: "80ms" }}>
        <AudienceCard icon={GraduationCap} title="I'm a student or staff member" description="Report a support issue and follow its progress through to resolution." onClick={() => onChoose("REPORTER")} />
        <AudienceCard icon={Wrench} title="I'm a technician" description="Manage assigned requests, record work and keep requesters informed." onClick={() => onChoose("TECHNICIAN")} />
      </div>
      <button type="button" onClick={() => onChoose("ADMIN")} className="auth-content-enter mx-auto mt-4 flex w-full max-w-3xl items-center gap-4 rounded-2xl border border-white/30 bg-white/10 px-5 py-4 text-left shadow-lg backdrop-blur-md transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" style={{ animationDelay: "150ms" }}>
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white"><ShieldCheck className="size-5" /></span>
        <span className="min-w-0 flex-1"><span className="block font-semibold">I'm an administrator</span><span className="mt-0.5 block text-sm text-white/75">Manage users, permissions, tickets and system settings.</span></span>
        <span className="hidden items-center gap-2 text-sm font-semibold sm:flex">Continue <ArrowRight className="size-4" /></span>
      </button>
    </section>
    <footer className="relative z-10 px-4 pb-5 text-center text-xs text-white/75">© 2026 North-West University · CSIS IT Support</footer>
  </main>;
}

function AudienceCard({ icon: Icon, title, description, onClick }: { icon: typeof GraduationCap; title: string; description: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="group flex min-h-48 w-full flex-col items-start rounded-2xl bg-white p-6 text-left text-slate-900 shadow-xl shadow-[#211036]/20 transition duration-200 hover:-translate-y-0.5 hover:shadow-2xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/70">
    <span className="flex size-11 items-center justify-center rounded-xl bg-purple-100 text-[#4B2C70] transition group-hover:bg-[#4B2C70] group-hover:text-white"><Icon className="size-5" /></span>
    <span className="mt-5 block text-lg font-semibold">{title}</span>
    <span className="mt-1 block text-sm leading-5 text-slate-600">{description}</span>
    <span className="mt-auto flex items-center gap-2 pt-5 text-sm font-semibold text-[#4B2C70]">Continue <ArrowRight className="size-4 transition group-hover:translate-x-1" /></span>
  </button>;
}

function PortalLoading({ audience }: { audience: SignInAudience | null }) {
  const audienceName = audience === "REPORTER" ? "reporter" : audience === "TECHNICIAN" ? "technician" : "administrator";
  return <main className="relative isolate flex min-h-dvh items-center justify-center overflow-hidden px-6 text-center text-white" aria-live="polite" aria-busy="true">
    <AuthBackdrop />
    <AuthBrand />
    <div className="auth-content-enter relative z-10 flex flex-col items-center">
      <LoaderCircle className="size-8 animate-spin text-white/90 motion-reduce:animate-none" aria-hidden="true" />
      <h1 className="mt-5 text-2xl font-semibold">Opening {audienceName} sign in…</h1>
      <p className="mt-2 text-sm text-white/80">Preparing your secure CSIS portal.</p>
    </div>
  </main>;
}

function PasswordInput(props: React.ComponentProps<typeof Input>) {
  const [visible, setVisible] = useState(false);
  return <div className="relative"><Input {...props} type={visible ? "text" : "password"} className={`pr-11 ${props.className ?? ""}`} /><button type="button" className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-gray-500 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B2C70]" onClick={() => setVisible((current) => !current)} aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible}>{visible ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}</button></div>;
}

const loginFaq = [
  { question: "Who can register?", answer: "Students and staff with a valid @mynwu.ac.za email address can create a reporter account. Technician and administrator accounts are created by an administrator." },
  { question: "How do I report a fault?", answer: "Register or sign in, choose the category and urgency, identify the location or station, and describe the issue and any troubleshooting already attempted." },
  { question: "Where can I track progress?", answer: "Open My tickets after signing in to view status, comments, technician updates, recorded work, escalation details, and the final resolution." },
  { question: "What counts as a critical issue?", answer: "Use Critical for serious service impact or physical hazards such as smoke, exposed wiring, overheating equipment, or electrical danger." },
];

function LoginHelp() {
  const [open, setOpen] = useState(false);

  return <Dialog open={open} onOpenChange={setOpen}>
    <Button type="button" variant="ghost" size="icon" className="absolute top-4 right-4 size-9 rounded-full text-[#4B2C70] hover:bg-purple-50 hover:text-[#4B2C70]" aria-label="Help and onboarding" title="Help and onboarding" aria-haspopup="dialog" onClick={() => setOpen(true)}>
      <HelpCircle className="size-4" />
    </Button>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
      <DialogHeader><DialogTitle className="flex items-center gap-2"><HelpCircle className="size-5 text-[#4B2C70]" /> Help and onboarding</DialogTitle><DialogDescription>Quick answers before you sign in.</DialogDescription></DialogHeader>
      <div className="space-y-3">{loginFaq.map((item) => <details key={item.question} className="group rounded-lg border bg-white px-4 py-3"><summary className="cursor-pointer list-none text-sm font-medium text-slate-900 marker:hidden"><span className="flex items-center justify-between gap-3">{item.question}<span className="text-[#4B2C70] transition group-open:rotate-45">+</span></span></summary><p className="mt-2 text-sm leading-6 text-muted-foreground">{item.answer}</p></details>)}<a href="/api/resources/user-guide" download="csis-it-support-user-guide.pdf" className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#4B2C70] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#3d235d]"><Download className="size-4" /> Download user guide (PDF)</a><p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground"><BookOpen className="size-3.5" /> Includes reporter, technician, administrator, workflow, and FAQ guidance.</p></div>
    </DialogContent>
  </Dialog>;
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) { return <div className="space-y-2"><Label htmlFor={htmlFor}>{label}</Label>{children}</div>; }
function ModeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) { return <Button type="button" variant={active ? "default" : "ghost"} className={active ? "bg-[#4B2C70] text-white hover:bg-[#3d235d]" : "text-slate-700 hover:bg-white hover:text-[#4B2C70]"} onClick={onClick}>{children}</Button>; }
function initials(name: string) { return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }
