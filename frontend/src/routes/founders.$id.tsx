import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { TopNav } from "@/components/vc/TopNav";
import { RequireAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import type { Founder, Deal } from "@/lib/mocks";
import { cn } from "@/lib/utils";
import { ArrowUpRight, ArrowDownRight, ArrowRight, ArrowLeft, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/founders/$id")({
  head: ({ params }) => ({
    meta: [
      { title: `Founder — Scopos` },
      { name: "description", content: `Founder profile ${params.id} — long-term memory across projects.` },
    ],
  }),
  component: () => <RequireAuth><FounderDetail /></RequireAuth>,
});

function FounderDetail() {
  const { id } = Route.useParams();
  const founderQuery = useQuery({ queryKey: ["founder", id], queryFn: () => api.getFounder(id) });
  const dealsQuery = useQuery({ queryKey: ["deals"], queryFn: () => api.listDeals() });
  const f = founderQuery.data;
  const projects = (dealsQuery.data ?? []).filter((d) => d.founderIds.includes(id));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopNav />
      <main className="mx-auto max-w-5xl px-6 py-8">
        <Link to="/founders" className="mb-6 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> All founders
        </Link>
        {founderQuery.isLoading || !f ? (
          <div className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground">Loading founder…</div>
        ) : (
          <FounderProfile f={f} projects={projects} />
        )}
      </main>
    </div>
  );
}

function FounderProfile({ f, projects }: { f: Founder; projects: Deal[] }) {
  const tone = f.founderScore >= 80 ? "text-success border-success/40 bg-success/10"
    : f.founderScore >= 60 ? "text-warning border-warning/40 bg-warning/10"
    : "text-danger border-danger/40 bg-danger/10";
  return (
    <div className="space-y-8">
      <header className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{f.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{f.role} · {f.location}</p>
            <p className="mt-3 max-w-2xl text-sm text-foreground/90">{f.bio}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {f.expertise.map((e) => (
                <span key={e} className="rounded border border-border bg-surface-2 px-2 py-0.5 text-[11px] text-muted-foreground">{e}</span>
              ))}
            </div>
          </div>
          <div className={cn("rounded-xl border px-5 py-3 text-center font-mono", tone)}>
            <div className="text-[10px] uppercase tracking-widest opacity-80">Founder Score</div>
            <div className="text-4xl font-bold leading-none">{f.founderScore}</div>
            <div className="mt-1 flex items-center justify-center gap-1 text-[10px] uppercase tracking-widest">
              <TrendIcon t={f.scoreTrend} /> {f.scoreTrend}
            </div>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4 text-xs">
          {f.linkedin && <LinkPill href={f.linkedin} label="LinkedIn" />}
          {f.github && <LinkPill href={f.github} label="GitHub" />}
          {f.website && <LinkPill href={f.website} label="Website" />}
          {!f.linkedin && <span className="rounded-md border border-dashed border-border/60 px-2.5 py-1.5 text-muted-foreground/70">LinkedIn Not provided</span>}
          {!f.github && <span className="rounded-md border border-dashed border-border/60 px-2.5 py-1.5 text-muted-foreground/70">GitHub Not provided</span>}
        </div>
      </header>

      <Section title="Score breakdown">
        <div className="grid gap-2 sm:grid-cols-2">
          {f.components.map((c) => (
            <div key={c.label} className="flex items-center justify-between rounded-md border border-border bg-surface-1 px-3 py-2">
              <span className="text-xs">{c.label}</span>
              <span className="font-mono text-xs font-semibold text-success">+{c.points}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="History — score-affecting events over time">
        <SparklineChart history={f.history} />
        <ol className="mt-4 divide-y divide-border rounded-xl border border-border bg-surface-1">
          {f.history.map((h, i) => (
            <li key={i} className="grid grid-cols-[100px_1fr_auto] items-center gap-3 px-3 py-2 text-xs">
              <span className="font-mono text-muted-foreground">{h.date}</span>
              <div>
                <div>{h.event}</div>
                <div className="text-[10px] text-muted-foreground">{h.source}</div>
              </div>
              <span className={cn("rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold",
                h.delta > 0 ? "bg-success/10 text-success" : "bg-danger/10 text-danger")}>{h.delta > 0 ? "+" : ""}{h.delta}</span>
            </li>
          ))}
        </ol>
      </Section>

      <Section title={`Projects (${projects.length})`} subtitle="Every company this founder has been associated with.">
        <div className="grid gap-3 sm:grid-cols-2">
          {projects.map((p) => (
            <Link key={p.id} to="/command" search={{ deal: p.id, tab: "overview", claim: undefined }} className="rounded-xl border border-border bg-surface-1 p-4 hover:bg-surface-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">{p.company}</div>
                <span className="rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted-foreground">{p.pipelineStage}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{p.tagline}</p>
            </Link>
          ))}
          {projects.length === 0 && <div className="rounded-md border border-dashed border-border p-4 text-xs text-muted-foreground">No linked projects.</div>}
        </div>
      </Section>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function LinkPill({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-xs hover:bg-surface-3">
      {label} <ExternalLink className="h-3 w-3 text-muted-foreground" />
    </a>
  );
}

function TrendIcon({ t }: { t: "up" | "flat" | "down" }) {
  if (t === "up") return <ArrowUpRight className="h-3 w-3" />;
  if (t === "down") return <ArrowDownRight className="h-3 w-3" />;
  return <ArrowRight className="h-3 w-3" />;
}

function SparklineChart({ history }: { history: Founder["history"] }) {
  if (history.length === 0) return null;
  // Cumulative score over time from a baseline of 50.
  const pts = history.reduce<{ x: number; y: number; label: string }[]>((acc, h, i) => {
    const prev = acc[i - 1]?.y ?? 50;
    acc.push({ x: i, y: prev + h.delta, label: h.date });
    return acc;
  }, []);
  const W = 800, H = 120, pad = 12;
  const ys = pts.map((p) => p.y);
  const min = Math.min(...ys, 40), max = Math.max(...ys, 100);
  const xr = (i: number) => pad + (i / Math.max(1, pts.length - 1)) * (W - pad * 2);
  const yr = (v: number) => H - pad - ((v - min) / Math.max(1, max - min)) * (H - pad * 2);
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${xr(i)},${yr(p.y)}`).join(" ");
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface-1 p-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-32 w-full">
        <path d={d} fill="none" stroke="currentColor" strokeWidth="2" className="text-info" />
        {pts.map((p, i) => (
          <circle key={i} cx={xr(i)} cy={yr(p.y)} r="3" className="fill-foreground" />
        ))}
      </svg>
    </div>
  );
}
