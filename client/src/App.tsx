import { useEffect, useState, type FormEvent } from "react";
import { LoaderCircle, LogOut } from "lucide-react";
import { ReporterDashboard } from "@/components/reporter-dashboard";
import { TechnicianDashboard } from "@/components/technician-dashboard";
import type { UserRole } from "@/types";

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

type User = {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
};

type AuthResponse = {
  user?: User;
  error?: string;
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    async function checkSession() {
      try {
        const response = await fetch("/api/auth/me", {
          credentials: "include",
        });

        if (response.ok) {
          const result = (await response.json()) as AuthResponse;
          setUser(result.user ?? null);
        }
      } finally {
        setCheckingSession(false);
      }
    }

    void checkSession();
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });

    setUser(null);
  }

  if (checkingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <LoaderCircle
          className="size-8 animate-spin text-[#4B2C70]"
          aria-label="Checking session"
        />
      </main>
    );
  }

  if (!user) {
    return <AuthenticationPage onAuthenticated={setUser} />;
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <img
              src="/ticket-logo.png?v=2"
              alt="CSIS IT Support logo"
              className="h-10 w-auto object-contain"
            />

            <div>
              <p className="font-semibold">CSIS IT Support</p>
              <p className="text-sm text-muted-foreground">
                Ticket and Log System
              </p>
            </div>
          </div>

          <Button variant="outline" onClick={logout}>
            <LogOut />
            Sign out
          </Button>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-12">
        <p className="text-sm font-medium uppercase tracking-wider text-[#4B2C70]">
          Reporter portal
        </p>

        <h1 className="mt-2 text-3xl font-semibold">
          Welcome, {user.fullName}
        </h1>

        <p className="mt-2 text-muted-foreground">
          You are signed in as {user.email}.
        </p>

       {user.role === "REPORTER" ? (
          <ReporterDashboard />
        ) : (
         <TechnicianDashboard userId={user.id} userRole={user.role} />
        )}

      </section>
    </main>
  );
}

function AuthenticationPage({
  onAuthenticated,
}: {
  onAuthenticated: (user: User) => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    const form = new FormData(event.currentTarget);

    const body =
      mode === "register"
        ? {
            fullName: String(form.get("fullName") ?? ""),
            email: String(form.get("email") ?? ""),
            password: String(form.get("password") ?? ""),
          }
        : {
            email: String(form.get("email") ?? ""),
            password: String(form.get("password") ?? ""),
          };

    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const result = (await response.json()) as AuthResponse;

      if (!response.ok || !result.user) {
        setError(result.error ?? "Authentication failed");
        return;
      }

      onAuthenticated(result.user);
    } catch {
      setError("The server could not be reached.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="hidden bg-[#4B2C70] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <img
            src="/ticket-logo.png?v=2"
            alt="CSIS IT Support logo"
            className="size-11 object-contain"
          />

          <div>
            <p className="font-semibold">CSIS IT Support</p>
            <p className="text-sm text-purple-200">North-West University</p>
          </div>
        </div>

        <div className="max-w-lg">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-purple-200">
            One place for every request
          </p>

          <h1 className="mt-4 text-4xl font-semibold leading-tight">
            Report faults and follow their progress from submission to
            resolution.
          </h1>

          <p className="mt-5 text-lg leading-8 text-purple-100">
            A central support portal for CSIS students, staff, technicians, and
            administrators.
          </p>
        </div>

        <p className="text-sm text-purple-200">
          Secure access for authorised NWU users
        </p>
      </section>

      <section className="flex items-center justify-center bg-slate-50 p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl">
              {mode === "login" ? "Welcome back" : "Create your account"}
            </CardTitle>

            <CardDescription>
              {mode === "login"
                ? "Sign in using your NWU email address."
                : "Register as a student or staff reporter."}
            </CardDescription>
          </CardHeader>

          <CardContent>
            <div className="mb-6 grid grid-cols-2 rounded-lg bg-slate-100 p-1">
              <Button
                type="button"
                variant={mode === "login" ? "default" : "ghost"}
                className={
                  mode === "login"
                    ? "bg-[#4B2C70] text-white hover:bg-[#3d235d]"
                    : ""
                }
                onClick={() => {
                  setMode("login");
                  setError("");
                }}
              >
                Sign in
              </Button>

              <Button
                type="button"
                variant={mode === "register" ? "default" : "ghost"}
                className={
                  mode === "register"
                    ? "bg-[#4B2C70] text-white hover:bg-[#3d235d]"
                    : ""
                }
                onClick={() => {
                  setMode("register");
                  setError("");
                }}
              >
                Register
              </Button>
            </div>

            <form className="space-y-4" onSubmit={submit}>
              {mode === "register" && (
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full name</Label>
                  <Input
                    id="fullName"
                    name="fullName"
                    autoComplete="name"
                    required
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">NWU email address</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="name@mynwu.ac.za"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  minLength={mode === "register" ? 12 : undefined}
                  required
                />

                {mode === "register" && (
                  <p className="text-xs text-muted-foreground">
                    Use at least 12 characters, including uppercase, lowercase,
                    and a number.
                  </p>
                )}
              </div>

              {error && (
                <p
                  className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
                  role="alert"
                >
                  {error}
                </p>
              )}

              <Button
                type="submit"
                className="h-10 w-full bg-[#4B2C70] text-white hover:bg-[#3d235d]"
                disabled={submitting}
              >
                {submitting && <LoaderCircle className="animate-spin" />}
                {submitting
                  ? "Please wait..."
                  : mode === "login"
                    ? "Sign in"
                    : "Create account"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
