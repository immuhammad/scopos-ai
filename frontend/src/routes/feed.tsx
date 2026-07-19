import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { TopNav } from "@/components/vc/TopNav";
import { RequireAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Radio, Github, Loader2, MessageSquare, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/feed")({
  head: () => ({
    meta: [
      { title: "Sourcing — Scopos" },
      { name: "description", content: "Streaming sourcing signals from Hacker News, GitHub, and other outbound channels — one pipeline, many channels." },
    ],
  }),
  component: () => <RequireAuth><FeedPage /></RequireAuth>,
});

const FEED_PAGE = 20;

function FeedPage() {
  const qc = useQueryClient();
  const { data, error } = useQuery({ queryKey: ["sourcing"], queryFn: () => api.listSourcing() });
  const [busy, setBusy] = useState<null | "hn" | "gh">(null);
  const [sourceFilter, setSourceFilter] = useState("All");
  const [visible, setVisible] = useState(FEED_PAGE);

  const scan = async (which: "hn" | "gh") => {
    setBusy(which);
    try {
      const res = which === "hn" ? await api.ingestHackerNews() : await api.ingestGitHub();
      qc.invalidateQueries({ queryKey: ["sourcing"] });
      qc.invalidateQueries({ queryKey: ["founders"] });
      qc.invalidateQueries({ queryKey: ["deals"] });
      qc.invalidateQueries({ queryKey: ["metrics"] });
      const dealCount = res.deals?.length ?? 0;
      toast.success(
        `${which === "hn" ? "Hacker News" : "GitHub"} scan: ${res.signals.length} new signal${res.signals.length === 1 ? "" : "s"} · ${res.founders.length} founder${res.founders.length === 1 ? "" : "s"}${dealCount ? ` · ${dealCount} deal${dealCount === 1 ? "" : "s"} through the full pipeline` : ""}`,
      );
      if (res.deals?.length) {
        toast(`New deals: ${res.deals.map((d) => d.company).join(", ")} — now in the Dashboard pipeline`);
      }
    } catch { toast.error("Scan failed — is the backend running?"); }
    finally { setBusy(null); }
  };

  const sources = ["All", ...Array.from(new Set((data ?? []).map((it) => it.source)))];
  const items = (data ?? []).filter((it) => sourceFilter === "All" || it.source === sourceFilter);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopNav />
      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-border bg-surface-1 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              <Radio className="h-3 w-3 text-success" /> Live sourcing stream
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">Sourcing Feed</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Every raw signal the outbound engine picks up. A scan runs discovered founders through the SAME
              pipeline as inbound applications — one funnel. Live scans take 1–2 min per processed deal.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => scan("hn")} disabled={!!busy}>
              {busy === "hn" ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <MessageSquare className="mr-1.5 h-3 w-3" />} Scan Hacker News
            </Button>
            <Button variant="outline" size="sm" onClick={() => scan("gh")} disabled={!!busy}>
              {busy === "gh" ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <Github className="mr-1.5 h-3 w-3" />} Scan GitHub
            </Button>
            <Button variant="ghost" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["sourcing"] })}>
              <RefreshCw className="h-3 w-3" />
            </Button>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          {["arXiv Papers", "ProductHunt", "Accelerator Cohorts", "Hackathon Winners"].map((c) => (
            <button key={c} disabled
              className="cursor-not-allowed rounded-md border border-dashed border-border bg-surface-1 px-2.5 py-1 text-[11px] text-muted-foreground/60"
              title="Coming soon">
              {c} · soon
            </button>
          ))}
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">One pipeline, many channels.</span>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {sources.map((s) => (
            <button key={s} onClick={() => { setSourceFilter(s); setVisible(FEED_PAGE); }}
              className={cn("rounded-md border px-2 py-0.5 text-[11px] transition-colors",
                sourceFilter === s ? "border-info/50 bg-info/10 text-info" : "border-border bg-surface-1 text-muted-foreground hover:text-foreground")}>
              {s}
            </button>
          ))}
          <span className="ml-auto text-[11px] text-muted-foreground">{items.length} signal{items.length === 1 ? "" : "s"}</span>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {error ? (
            <div className="p-8 text-sm text-danger">Feed unavailable — backend unreachable.</div>
          ) : !data ? (
            <div className="p-8 text-sm text-muted-foreground">Loading feed…</div>
          ) : items.length === 0 ? (
            <div className="p-8 text-sm text-muted-foreground">No signals for this source yet — run a scan.</div>
          ) : (
            <ul className="divide-y divide-border">
              {items.slice(0, visible).map((it) => (
                <li key={it.id} className="flex items-start gap-4 p-4 ticker-fade-in">
                  <span className={cn(
                    "shrink-0 rounded border px-2 py-0.5 font-mono text-[10px]",
                    it.time === "now"
                      ? "border-success/40 bg-success/10 text-success"
                      : "border-border bg-surface-2 text-muted-foreground",
                  )}>{it.source}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground/90">{it.text}</p>
                    <p className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">{it.time} ago</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {data && items.length > visible && (
            <button onClick={() => setVisible((v) => v + FEED_PAGE)}
              className="block w-full border-t border-border p-3 text-center text-xs text-muted-foreground hover:bg-surface-1 hover:text-foreground">
              Load more · {items.length - visible} remaining
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
