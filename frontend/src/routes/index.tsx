import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { TopNav } from "@/components/vc/TopNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  component: SignIn,
});

function SignIn() {
  const navigate = useNavigate();
  const { ready, signedIn, signIn } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  // Already signed in → the landing page is not for you; go to the dashboard.
  useEffect(() => {
    if (ready && signedIn) navigate({ to: "/command" });
  }, [ready, signedIn, navigate]);
  const [email, setEmail] = useState("partner@northwave.vc");
  const [password, setPassword] = useState("••••••••••");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopNav />
      <main className="relative mx-auto grid min-h-[calc(100vh-3.5rem)] max-w-[1600px] grid-cols-1 items-center gap-12 px-6 py-16 lg:grid-cols-2">
        {/* Left: brand */}
        <section className="max-w-xl">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-surface-1 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-success" /> Partner-only preview
          </p>
          <h1 className="text-5xl font-semibold leading-[1.05] tracking-tight lg:text-6xl">
            The operating system for<br />
            <span className="text-muted-foreground">high-conviction venture.</span>
          </h1>
          <p className="mt-6 text-base leading-relaxed text-muted-foreground">
            Three-axis diligence, per-claim trust radar, and a 24-hour decision terminal.
            Built for partners who write a check on Monday and defend it on Friday.
          </p>
          <dl className="mt-10 grid grid-cols-3 gap-6 border-t border-border pt-8">
            {[
              { k: "Axes evaluated", v: "3", sub: "never averaged" },
              { k: "Median decision time", v: "18h", sub: "vs 6-week industry" },
              { k: "Verified claims / deal", v: "6.4", sub: "cross-sourced" },
            ].map((s) => (
              <div key={s.k}>
                <dt className="text-[11px] uppercase tracking-widest text-muted-foreground">{s.k}</dt>
                <dd className="mt-2 text-3xl font-semibold tracking-tight">{s.v}</dd>
                <dd className="text-xs text-muted-foreground">{s.sub}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Right: login card */}
        <section className="w-full max-w-md justify-self-center lg:justify-self-end">
          <div className="rounded-2xl border border-border bg-card p-8 shadow-2xl shadow-black/40">
            <div className="mb-6">
              <h2 className="text-xl font-semibold tracking-tight">
                {mode === "signin" ? "Sign in to Scopos" : "Request partner access"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {mode === "signin"
                  ? "Continue to your Investor Command Center."
                  : "New partners are onboarded within one business day."}
              </p>
            </div>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                signIn();
                navigate({ to: "/command" });
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs uppercase tracking-widest text-muted-foreground">Professional email</Label>
                <Input
                  id="email" type="email" value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 bg-surface-1"
                  autoComplete="email"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs uppercase tracking-widest text-muted-foreground">Password</Label>
                <Input
                  id="password" type="password" value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 bg-surface-1"
                  autoComplete="current-password"
                />
              </div>
              <Button type="submit" className="h-11 w-full text-sm font-medium">
                {mode === "signin" ? "Sign In as Partner" : "Request Access"}
              </Button>
              <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground">
                <button
                  type="button"
                  onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                  className="underline-offset-4 hover:text-foreground hover:underline"
                >
                  {mode === "signin" ? "Create Account / Apply for Access" : "Already have an account? Sign in"}
                </button>
                <span className="font-mono">SSO · SOC 2</span>
              </div>
              <p className="pt-1 text-center text-[10px] uppercase tracking-widest text-muted-foreground">
                Demo authentication — any credentials work
              </p>
            </form>
          </div>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Founder building a startup?{" "}
            <a href="/apply" className="text-foreground underline underline-offset-4">Submit your company →</a>
          </p>
        </section>
      </main>
    </div>
  );
}