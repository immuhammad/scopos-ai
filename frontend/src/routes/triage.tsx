import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { TopNav } from "@/components/vc/TopNav";
import { RequireAuth } from "@/lib/auth";
import { api, scoreThesisMatch, type ThesisMatch } from "@/lib/api";
import type { Deal } from "@/lib/mocks";
import { cn } from "@/lib/utils";
import { Heart, X as XIcon, ArrowUp, Info, Target, ExternalLink, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/triage")({
  head: () => ({
    meta: [
      { title: "Triage — Scopos" },
      { name: "description", content: "Rapid mobile-first review of overnight discoveries. Swipe to shortlist, pass, or request more info." },
    ],
  }),
  component: () => <RequireAuth><TriagePage /></RequireAuth>,
});

type Action = "star" | "pass" | "info";

function TriagePage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data } = useQuery({ queryKey: ["deals"], queryFn: () => api.listDeals() });
  const activeThesisQ = useQuery({ queryKey: ["activeThesis"], queryFn: () => api.getActiveThesis() });
  const thesis = activeThesisQ.data;

  const queue = useMemo(() => (data ?? []).filter((d) => d.pipelineStage === "Screening"), [data]);
  const [processed, setProcessed] = useState<Set<string>>(new Set());
  const [swipe, setSwipe] = useState<{ id: string; action: Action } | null>(null);

  const remaining = queue.filter((d) => !processed.has(d.id));
  const current = remaining[0];

  const doAction = async (deal: Deal, action: Action) => {
    setSwipe({ id: deal.id, action });
    await new Promise((r) => setTimeout(r, 260));
    try {
      if (action === "star") { await api.starDeal(deal.id, true); toast.success(`Shortlisted ${deal.company}`); }
      else if (action === "pass") { await api.setDealStage(deal.id, "Declined", "Passed in Triage."); toast(`Passed — ${deal.company}`); }
      else { await api.setDealStage(deal.id, "Diligence", "Request more info — flagged in Triage."); toast.success(`Info requested from ${deal.company}`); }
      qc.invalidateQueries({ queryKey: ["deals"] });
    } catch { toast.error("Action failed"); }
    setProcessed((prev) => new Set(prev).add(deal.id));
    setSwipe(null);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopNav />
      <main className="mx-auto max-w-md px-4 py-6 sm:py-10">
        <div className="mb-4 text-center">
          <p className="inline-flex items-center gap-2 rounded-full border border-warning/40 bg-warning/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-warning">
            <Sparkles className="h-3 w-3" /> Triage Mode
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Rapid review of overnight discoveries</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Swipe or tap. Right = shortlist. Left = pass. Up = request more info.
          </p>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {remaining.length} in queue · {processed.size} processed
          </p>
        </div>

        <div className="relative mx-auto h-[520px] max-w-sm">
          {remaining.slice(0, 3).reverse().map((d, i) => {
            const depth = remaining.slice(0, 3).length - 1 - i;
            const isTop = depth === 0;
            const isSwiping = swipe?.id === d.id;
            return (
              <TriageCard
                key={d.id}
                deal={d}
                thesis={thesis ? scoreThesisMatch(d, thesis) : null}
                interactive={isTop}
                depth={depth}
                swipeAction={isSwiping ? swipe!.action : null}
                onAction={(a) => doAction(d, a)}
              />
            );
          })}
          {!current && (
            <div className="grid h-full place-items-center rounded-2xl border border-dashed border-border bg-surface-1 p-6 text-center">
              <div>
                <h2 className="text-lg font-semibold">Queue clear</h2>
                <p className="mt-1 text-xs text-muted-foreground">All Screening-stage deals reviewed. Nice.</p>
                <Button className="mt-4" onClick={() => navigate({ to: "/command", search: { deal: "", tab: "overview" as const, claim: undefined, q: undefined } })}>
                  Open Command Center
                </Button>
              </div>
            </div>
          )}
        </div>

        {current && (
          <div className="mt-6 flex items-center justify-center gap-4">
            <ActionButton tone="danger" title="Pass (Decline)" onClick={() => doAction(current, "pass")}>
              <XIcon className="h-5 w-5" />
            </ActionButton>
            <ActionButton tone="info" title="Request more info" onClick={() => doAction(current, "info")}>
              <ArrowUp className="h-5 w-5" />
            </ActionButton>
            <ActionButton tone="success" title="Shortlist" onClick={() => doAction(current, "star")}>
              <Heart className="h-5 w-5" />
            </ActionButton>
          </div>
        )}
      </main>
    </div>
  );
}

function ActionButton({ children, tone, onClick, title }: { children: React.ReactNode; tone: "success" | "danger" | "info"; onClick: () => void; title: string }) {
  const cls = tone === "success" ? "border-success/50 bg-success/10 text-success hover:bg-success/20"
    : tone === "danger" ? "border-danger/50 bg-danger/10 text-danger hover:bg-danger/20"
    : "border-info/50 bg-info/10 text-info hover:bg-info/20";
  return (
    <button title={title} onClick={onClick} className={cn("grid h-14 w-14 place-items-center rounded-full border-2 transition-transform hover:scale-105", cls)}>
      {children}
    </button>
  );
}

function TriageCard({ deal, thesis, interactive, depth, swipeAction, onAction }: {
  deal: Deal; thesis: ThesisMatch | null; interactive: boolean; depth: number;
  swipeAction: Action | null; onAction: (a: Action) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => { if (!interactive) setDrag(null); }, [interactive]);

  const onStart = (x: number, y: number) => { if (!interactive) return; startRef.current = { x, y }; };
  const onMove = (x: number, y: number) => {
    if (!interactive || !startRef.current) return;
    setDrag({ x: x - startRef.current.x, y: y - startRef.current.y });
  };
  const onEnd = () => {
    if (!interactive || !drag) { startRef.current = null; setDrag(null); return; }
    const { x, y } = drag;
    if (x > 110) onAction("star");
    else if (x < -110) onAction("pass");
    else if (y < -110) onAction("info");
    startRef.current = null; setDrag(null);
  };

  const style: React.CSSProperties = interactive && drag
    ? { transform: `translate(${drag.x}px, ${drag.y}px) rotate(${drag.x / 20}deg)`, transition: "none" }
    : interactive
      ? { transform: swipeAction === "star" ? "translate(500px,0) rotate(20deg)"
          : swipeAction === "pass" ? "translate(-500px,0) rotate(-20deg)"
          : swipeAction === "info" ? "translate(0,-500px)" : "translate(0,0) rotate(0)",
          transition: "transform 240ms cubic-bezier(0.2, 0.7, 0.2, 1)" }
      : { transform: `translate(0, ${depth * 6}px) scale(${1 - depth * 0.04})`, transition: "transform 200ms" };

  const dragHint = drag && Math.abs(drag.x) > 40 && Math.abs(drag.x) > Math.abs(drag.y)
    ? (drag.x > 0 ? "star" : "pass") : drag && drag.y < -40 ? "info" : null;

  return (
    <div
      ref={ref}
      onTouchStart={(e) => { const t = e.touches[0]; onStart(t.clientX, t.clientY); }}
      onTouchMove={(e) => { const t = e.touches[0]; onMove(t.clientX, t.clientY); }}
      onTouchEnd={onEnd}
      onMouseDown={(e) => onStart(e.clientX, e.clientY)}
      onMouseMove={(e) => { if (e.buttons === 1) onMove(e.clientX, e.clientY); }}
      onMouseUp={onEnd} onMouseLeave={onEnd}
      className={cn(
        "absolute inset-0 select-none rounded-2xl border border-border bg-card p-5 shadow-2xl",
        interactive ? "z-30 cursor-grab active:cursor-grabbing" : depth === 1 ? "z-20" : "z-10",
      )}
      style={style}
    >
      {dragHint && (
        <div className={cn(
          "pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl text-3xl font-black uppercase tracking-widest",
          dragHint === "star" && "bg-success/10 text-success",
          dragHint === "pass" && "bg-danger/10 text-danger",
          dragHint === "info" && "bg-info/10 text-info",
        )}>
          {dragHint === "star" ? "Shortlist" : dragHint === "pass" ? "Pass" : "More info"}
        </div>
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-xl font-semibold tracking-tight">{deal.company}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{deal.stage} · {deal.geography} · {deal.sector}</p>
        </div>
        {deal.isColdStart && (
          <span className="shrink-0 rounded border border-warning/40 bg-warning/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-warning">
            Cold-start
          </span>
        )}
      </div>

      <p className="mt-3 line-clamp-3 text-sm text-foreground/90">{deal.tagline}</p>

      <div className="mt-5 grid grid-cols-3 gap-2">
        <AxisTile label="Team" score={deal.founderAxis.score} />
        <AxisTile label="Market" score={ratingToScore(deal.market.rating)} custom={deal.market.rating} />
        <AxisTile label="Idea/Mkt" score={deal.ideaVsMarket.score} />
      </div>

      {thesis && (
        <div className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-dashed border-info/40 bg-info/10 px-2.5 py-1 text-info">
          <Target className="h-3 w-3" />
          <span className="font-mono text-xs font-bold">Thesis {thesis.score}%</span>
        </div>
      )}

      <div className="mt-4 rounded-lg border border-border bg-surface-1 p-3 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1.5 text-foreground/90">
          <Info className="h-3 w-3" /> Next action
        </div>
        <p className="mt-1">{deal.nextAction}</p>
      </div>

      <a
        href={`/command?deal=${deal.id}&tab=overview`}
        onClick={(e) => e.stopPropagation()}
        className="mt-4 inline-flex items-center gap-1 text-[11px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        Open full profile <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}

function AxisTile({ label, score, custom }: { label: string; score: number; custom?: string }) {
  const tone = score >= 75 ? "border-success/40 text-success bg-success/5"
    : score >= 55 ? "border-warning/40 text-warning bg-warning/5"
    : "border-danger/40 text-danger bg-danger/5";
  return (
    <div className={cn("rounded-md border px-2 py-2 text-center", tone)}>
      <div className="text-[9px] uppercase tracking-widest opacity-80">{label}</div>
      <div className="font-mono text-sm font-bold">{custom ?? score}</div>
    </div>
  );
}

function ratingToScore(r: Deal["market"]["rating"]): number { return r === "Bullish" ? 82 : r === "Neutral" ? 60 : 40; }
