import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TopNav } from "@/components/vc/TopNav";
import { RequireAuth } from "@/lib/auth";
import { api, type DecisionRecord } from "@/lib/api";
import type { Deal } from "@/lib/mocks";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Gavel, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/decisions")({
  head: () => ({
    meta: [
      { title: "Decisions — Scopos" },
      { name: "description", content: "Decision review & audit. Simulated decisions, clearly labeled — every note preserved." },
    ],
  }),
  component: () => <RequireAuth><DecisionsPage /></RequireAuth>,
});

const PAGE = 10;

function DecisionsPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ["deals", "decided"], queryFn: () => api.listDeals("decided") });
  const [filter, setFilter] = useState<"all" | "Approved" | "Declined">("all");
  const [visible, setVisible] = useState(PAGE);
  const [openDeal, setOpenDeal] = useState<Deal | null>(null);

  const deals = useMemo(() => (data ?? []).filter((d) => filter === "all" || d.pipelineStage === filter), [data, filter]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopNav />
      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-8">
          <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-border bg-surface-1 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            <Gavel className="h-3 w-3" /> Decision review &amp; audit
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Decisions</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Every recorded decision with its required note — the audit trail behind each simulated check.
            Decided deals leave the pending dealflow automatically.
          </p>
        </div>

        <div className="mb-4 flex items-center gap-1.5">
          {(["all", "Approved", "Declined"] as const).map((f) => (
            <button key={f} onClick={() => { setFilter(f); setVisible(PAGE); }}
              className={cn("rounded-md border px-2.5 py-1 text-xs transition-colors",
                filter === f ? "border-info/50 bg-info/10 text-info" : "border-border bg-surface-1 text-muted-foreground hover:text-foreground")}>
              {f === "all" ? "All" : f}
            </button>
          ))}
          <span className="ml-auto text-[11px] text-muted-foreground">{deals.length} decided deal{deals.length === 1 ? "" : "s"}</span>
        </div>

        {isLoading ? (
          <div className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground">Loading decisions…</div>
        ) : error ? (
          <div className="rounded-xl border border-danger/40 bg-danger/5 p-8 text-sm text-danger">Decisions unavailable — backend unreachable.</div>
        ) : deals.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
            No decided deals yet. Record a decision from a deal's Decision tab — it will land here.
          </div>
        ) : (
          <>
            <ul className="space-y-3">
              {deals.slice(0, visible).map((d) => <DecidedCard key={d.id} deal={d} onOpen={() => setOpenDeal(d)} />)}
            </ul>
            {deals.length > visible && (
              <button onClick={() => setVisible((v) => v + PAGE)}
                className="mt-4 w-full rounded-lg border border-border bg-card p-3 text-center text-xs text-muted-foreground hover:bg-surface-1 hover:text-foreground">
                Load more · {deals.length - visible} remaining
              </button>
            )}
          </>
        )}
      </main>
      <DecisionDetailSheet deal={openDeal} onClose={() => setOpenDeal(null)} />
    </div>
  );
}

function DecidedCard({ deal, onOpen }: { deal: Deal; onOpen: () => void }) {
  const decisionsQ = useQuery({ queryKey: ["decisions", deal.id], queryFn: () => api.listDecisions(deal.id) });
  const latest = decisionsQ.data?.[0];
  const approved = deal.pipelineStage === "Approved";
  return (
    <li>
      <button onClick={onOpen} className="block w-full rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-surface-1">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">{deal.company}</h3>
              <span className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium",
                approved ? "border-success/40 bg-success/10 text-success" : "border-danger/40 bg-danger/10 text-danger")}>
                {approved ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />} {deal.pipelineStage}
              </span>
              {latest && (
                <span className="rounded border border-info/40 bg-info/10 px-1.5 py-0.5 text-[10px] text-info">{latest.analysisLabel}</span>
              )}
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{deal.tagline}</p>
          </div>
          <div className="text-right font-mono text-[11px] text-muted-foreground">
            {latest ? new Date(latest.timestamp).toLocaleString() : ""}
            {deal.signalToDecisionHours != null && <div className="mt-0.5">signal→decision {deal.signalToDecisionHours}h</div>}
          </div>
        </div>
        {latest && <p className="mt-2 line-clamp-2 text-xs text-foreground/90">{latest.note}</p>}
        {latest?.conditions && (
          <p className="mt-1 text-[11px] text-info">Conditions: {latest.conditions}</p>
        )}
      </button>
    </li>
  );
}

function DecisionDetailSheet({ deal, onClose }: { deal: Deal | null; onClose: () => void }) {
  const navigate = useNavigate();
  const decisionsQ = useQuery({
    queryKey: ["decisions", deal?.id ?? ""],
    queryFn: () => api.listDecisions(deal!.id),
    enabled: !!deal,
  });
  const decisions = decisionsQ.data ?? [];
  return (
    <Sheet open={!!deal} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        {deal && (
          <>
            <SheetHeader>
              <SheetTitle className="pr-6 text-left">{deal.company}</SheetTitle>
              <p className="text-left text-xs text-muted-foreground">{deal.sector} · {deal.stage} · {deal.geography} · read-only decision record</p>
            </SheetHeader>
            <div className="mt-5 space-y-4 text-sm">
              <div className="grid grid-cols-3 gap-2">
                <AxisBox label="Team" value={String(deal.founderAxis.score)} />
                <AxisBox label="Market" value={deal.market.rating} />
                <AxisBox label="Idea/Mkt" value={String(deal.ideaVsMarket.score)} />
              </div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Three independent axes at decision time — never combined.</p>
              <div>
                <div className="mb-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Decision history ({decisions.length})</div>
                <ul className="space-y-2">
                  {decisions.map((rec) => <RecordRow key={rec.id} rec={rec} />)}
                  {decisions.length === 0 && <li className="text-xs text-muted-foreground">No records.</li>}
                </ul>
              </div>
              <Button variant="outline" size="sm" onClick={() => navigate({ to: "/command", search: { deal: deal.id, tab: "decision" as const, claim: undefined, q: undefined } })}>
                Open full deal record <ExternalLink className="ml-1 h-3 w-3" />
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function RecordRow({ rec }: { rec: DecisionRecord }) {
  const approved = rec.kind === "approve" || rec.kind === "approve_conditions";
  return (
    <li className={cn("rounded-lg border bg-surface-1 p-3", approved ? "border-success/40" : rec.kind === "decline" ? "border-danger/40" : "border-warning/40")}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs font-semibold">{rec.kind.replace(/_/g, " ")}</span>
        <span className="rounded border border-info/40 bg-info/10 px-1.5 py-0.5 text-[10px] text-info">{rec.analysisLabel}</span>
      </div>
      <p className="mt-1.5 text-xs text-foreground/90">{rec.note}</p>
      {rec.conditions && <p className="mt-1 text-[11px] text-info">Conditions: {rec.conditions}</p>}
      <p className="mt-1.5 font-mono text-[10px] text-muted-foreground">{new Date(rec.timestamp).toLocaleString()} · {rec.actor}</p>
    </li>
  );
}

function AxisBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-surface-1 px-2 py-2 text-center">
      <div className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="font-mono text-sm font-bold">{value}</div>
    </div>
  );
}
