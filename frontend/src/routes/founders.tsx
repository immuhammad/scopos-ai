import { createFileRoute, Link, Outlet, useMatch } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TopNav } from "@/components/vc/TopNav";
import { RequireAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import type { Founder } from "@/lib/mocks";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ArrowUpRight, ArrowDownRight, ArrowRight, Search, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/founders")({
  head: () => ({
    meta: [
      { title: "Founders — Scopos" },
      { name: "description", content: "Project-independent Founder Memory. Every person the fund has ever seen, deduped across companies." },
    ],
  }),
  component: () => <RequireAuth><FoundersPage /></RequireAuth>,
});

function FoundersPage() {
  const isDetail = useMatch({ from: "/founders/$id", shouldThrow: false });
  if (isDetail) return <Outlet />;
  return <FoundersList />;
}

const FOUNDERS_PAGE = 15;

function FoundersList() {
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [minScore, setMinScore] = useState(0);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [visible, setVisible] = useState(FOUNDERS_PAGE);
  const { data, isLoading, error } = useQuery({ queryKey: ["founders"], queryFn: () => api.listFounders() });
  const statuses = ["All", ...Array.from(new Set((data ?? []).map((f) => f.contactStatus)))];
  const founders = (data ?? []).filter((f) =>
    (!q ||
      f.name.toLowerCase().includes(q.toLowerCase()) ||
      f.expertise.some((e) => e.toLowerCase().includes(q.toLowerCase())) ||
      f.email.toLowerCase().includes(q.toLowerCase())) &&
    (statusFilter === "All" || f.contactStatus === statusFilter) &&
    f.founderScore >= minScore &&
    (!flaggedOnly || f.contradictionCount > 0),
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopNav />
      <main className="mx-auto max-w-[1400px] px-6 py-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-border bg-surface-1 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Persistent memory · deduped across projects
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">Founders</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Every founder the fund has ever encountered. Each person carries a long-term
              Founder Score independent of which company they're currently working on.
              When a founder starts a new company, the memory follows them.
            </p>
          </div>
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search by name, expertise, email…" value={q} onChange={(e) => { setQ(e.target.value); setVisible(FOUNDERS_PAGE); }} className="h-10 bg-surface-1 pl-9" />
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setVisible(FOUNDERS_PAGE); }}
            className="h-8 rounded-md border border-border bg-surface-1 px-2 text-xs text-muted-foreground">
            {statuses.map((s) => <option key={s} value={s}>{s === "All" ? "All contact statuses" : s}</option>)}
          </select>
          <select value={minScore} onChange={(e) => { setMinScore(parseInt(e.target.value, 10)); setVisible(FOUNDERS_PAGE); }}
            className="h-8 rounded-md border border-border bg-surface-1 px-2 text-xs text-muted-foreground">
            <option value={0}>Any score</option>
            <option value={50}>Score ≥ 50</option>
            <option value={70}>Score ≥ 70</option>
            <option value={85}>Score ≥ 85</option>
          </select>
          <button onClick={() => { setFlaggedOnly((v) => !v); setVisible(FOUNDERS_PAGE); }}
            className={cn("rounded-md border px-2 py-1 transition-colors",
              flaggedOnly ? "border-danger/50 bg-danger/10 text-danger" : "border-border bg-surface-1 text-muted-foreground hover:text-foreground")}>
            Has contradictions
          </button>
          <span className="ml-auto text-muted-foreground">{founders.length} founder{founders.length === 1 ? "" : "s"}</span>
        </div>

        {error ? (
          <div className="rounded-xl border border-danger/40 bg-danger/5 p-8 text-sm text-danger">Founder Memory unavailable — backend unreachable.</div>
        ) : isLoading ? (
          <div className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground">Loading Founder Memory…</div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border bg-surface-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                  <th className="px-4 py-3">Founder</th>
                  <th className="px-4 py-3">Score</th>
                  <th className="px-4 py-3">Trend</th>
                  <th className="px-4 py-3">Expertise</th>
                  <th className="px-4 py-3">Projects</th>
                  <th className="px-4 py-3">Contact Status</th>
                  <th className="px-4 py-3">Flags</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {founders.slice(0, visible).map((f) => <FounderRow key={f.id} f={f} />)}
                {founders.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">No founders match your filters.</td></tr>
                )}
              </tbody>
            </table>
            {founders.length > visible && (
              <button onClick={() => setVisible((v) => v + FOUNDERS_PAGE)}
                className="block w-full border-t border-border p-3 text-center text-xs text-muted-foreground hover:bg-surface-1 hover:text-foreground">
                Load more · {founders.length - visible} remaining
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function FounderRow({ f }: { f: Founder }) {
  const tone = f.founderScore >= 80 ? "text-success" : f.founderScore >= 60 ? "text-warning" : "text-danger";
  const trendIcon = f.scoreTrend === "up" ? <ArrowUpRight className="h-3.5 w-3.5 text-success" />
    : f.scoreTrend === "down" ? <ArrowDownRight className="h-3.5 w-3.5 text-danger" />
    : <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />;
  return (
    <tr className="hover:bg-surface-1">
      <td className="px-4 py-3">
        <Link to="/founders/$id" params={{ id: f.id }} className="block">
          <div className="text-sm font-semibold">{f.name}</div>
          <div className="text-xs text-muted-foreground">{f.role} · {f.location}</div>
        </Link>
      </td>
      <td className="px-4 py-3"><span className={cn("font-mono text-lg font-bold", tone)}>{f.founderScore}</span></td>
      <td className="px-4 py-3">{trendIcon}</td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {f.expertise.slice(0, 3).map((e) => (
            <span key={e} className="rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted-foreground">{e}</span>
          ))}
        </div>
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">{f.projects.length} project{f.projects.length === 1 ? "" : "s"}</td>
      <td className="px-4 py-3"><span className="rounded border border-border bg-surface-2 px-2 py-0.5 text-[10px] font-medium">{f.contactStatus}</span></td>
      <td className="px-4 py-3">
        {f.contradictionCount > 0 ? (
          <span className="inline-flex items-center gap-1 rounded border border-danger/40 bg-danger/10 px-1.5 py-0.5 text-[10px] font-medium text-danger">
            <AlertTriangle className="h-3 w-3" /> {f.contradictionCount}
          </span>
        ) : <span className="text-[10px] text-muted-foreground">—</span>}
      </td>
    </tr>
  );
}
