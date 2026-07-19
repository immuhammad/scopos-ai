import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { TopNav } from "@/components/vc/TopNav";
import { RequireAuth } from "@/lib/auth";
import {
  api, scoreThesisMatch, isHighUpside, HIGH_UPSIDE_TOOLTIP,
  computeSignalStrength, isOutreachDeal,
  type Thesis, type ThesisMatch, type DecisionKind, type DecisionRecord, type NLSearchResult, type NLCriteria,
  type Metrics, type TraceItem, type Artifact,
} from "@/lib/api";
import type { Deal, Founder, Claim } from "@/lib/mocks";
import type { Trend, MarketRating, CoverageRating } from "@/lib/mocks";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ArrowUpRight, ArrowDownRight, ArrowRight, ShieldCheck, AlertTriangle,
  Play, Pause, Sparkles, ExternalLink, CheckCircle2, XCircle, Clock,
  ChevronDown, Info, Search, Target, Save, Star,
  RefreshCw, X, Loader2, Mail, Send, Signal, Copy, Hourglass, Rocket, FileText,
  Receipt,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = ["overview", "team", "trust", "memo", "receipts", "decision"] as const;
type TabKey = (typeof TABS)[number];

type CommandSearch = { deal?: string; tab?: TabKey; claim?: string; q?: string };
function validateCommandSearch(search: Record<string, unknown>): CommandSearch {
  const rawTab = String(search.tab ?? "");
  const tab = (TABS as readonly string[]).includes(rawTab) ? (rawTab as TabKey) : "overview";
  const deal = typeof search.deal === "string" ? search.deal : "";
  const claim = typeof search.claim === "string" && search.claim.length > 0 ? search.claim : undefined;
  const q = typeof search.q === "string" && search.q.length > 0 ? search.q : undefined;
  return { deal, tab, claim, q };
}

export const Route = createFileRoute("/command")({
  validateSearch: validateCommandSearch,
  head: () => ({
    meta: [
      { title: "Dashboard — Scopos" },
      { name: "description", content: "Ranked dealflow, three-axis diligence, trust radar, and the 24-hour decision terminal." },
    ],
  }),
  component: () => <RequireAuth><Command /></RequireAuth>,
});

const SECTORS = ["All Sectors", "AI Infra", "DevTools", "B2B SaaS", "Fintech"] as const;
const STAGES = ["All Stages", "Pre-Seed", "Seed", "Series A"] as const;
const GEOS = ["Global", "US", "Europe", "APAC"] as const;
const RISK = ["Conservative", "Balanced", "Aggressive"] as const;
const EXCLUDABLE_SECTORS = ["AI Infra", "DevTools", "B2B SaaS", "Fintech"] as const;

function Command() {
  const { deal: selectedDealParam = "", tab = "overview", claim: openClaimId, q } = Route.useSearch();
  const navigate = useNavigate({ from: "/command" });
  const setSelected = (id: string) =>
    navigate({ to: ".", search: (p: CommandSearch) => ({ ...p, deal: id, claim: undefined }) });
  const setTab = (t: TabKey) => navigate({ to: ".", search: (p: CommandSearch) => ({ ...p, tab: t }) });
  const setClaim = (id?: string) =>
    navigate({ to: ".", search: (p: CommandSearch) => ({ ...p, claim: id }) });
  const setQuery = (val?: string) =>
    navigate({ to: ".", search: (p: CommandSearch) => ({ ...p, q: val && val.length ? val : undefined }) });

  const [pipelineTab, setPipelineTab] = useState<"decision" | "outreach" | "wishlist">("decision");

  const dealsQuery = useQuery({ queryKey: ["deals"], queryFn: () => api.listDeals() });
  const foundersQuery = useQuery({ queryKey: ["founders"], queryFn: () => api.listFounders() });
  const activeThesisQ = useQuery({ queryKey: ["activeThesis"], queryFn: () => api.getActiveThesis() });
  const metricsQ = useQuery({ queryKey: ["metrics"], queryFn: () => api.getMetrics() });

  const deals = dealsQuery.data ?? [];
  const founders = foundersQuery.data ?? [];
  const activeThesis = activeThesisQ.data;

  const founderMap = useMemo(() => {
    const m = new Map<string, Founder>();
    for (const f of founders) m.set(f.id, f);
    return m;
  }, [founders]);

  // Thesis-scored + sorted — rule gates only; the three axes never enter the formula.
  const rankedDeals = useMemo(() => {
    if (!activeThesis) return deals.map((d) => ({ deal: d, thesisMatch: { score: 50, reasons: [], rules: [] } as ThesisMatch }));
    return deals
      .map((d) => ({ deal: d, thesisMatch: scoreThesisMatch(d, activeThesis) }))
      .sort((a, b) => b.thesisMatch.score - a.thesisMatch.score);
  }, [deals, activeThesis]);

  // Natural-language filtering (when q present)
  const nlQ = useQuery({
    queryKey: ["nlSearch", q ?? ""],
    queryFn: () => (q ? api.searchNaturalLanguage(q) : Promise.resolve(null)),
    enabled: !!q,
  });
  const nl = nlQ.data ?? null;

  const dealsForList = useMemo(() => {
    if (nl) {
      const matched = new Map(nl.deals.map((m) => [m.deal.id, m.match]));
      return rankedDeals.filter((r) => matched.has(r.deal.id));
    }
    return rankedDeals;
  }, [rankedDeals, nl]);

  // Split by pipeline: Decision-Ready (has deck / past invitation) vs. Outreach (outbound, no deck yet).
  const { decisionList, outreachList, wishlist } = useMemo(() => {
    const dec: Ranked[] = [];
    const out: Ranked[] = [];
    for (const r of dealsForList) (isOutreachDeal(r.deal) ? out : dec).push(r);
    // Decision list already sorted by Thesis Match desc; Outreach list re-sort by Signal Strength desc.
    out.sort((a, b) =>
      computeSignalStrength(b.deal, founderMap) - computeSignalStrength(a.deal, founderMap),
    );
    return { decisionList: dec, outreachList: out,
             wishlist: dealsForList.filter((r) => r.deal.starred) };
  }, [dealsForList, founderMap]);

  const currentList = pipelineTab === "decision" ? decisionList : pipelineTab === "outreach" ? outreachList : wishlist;
  const selectedId = selectedDealParam || currentList[0]?.deal.id || deals[0]?.id || "";
  const selected = deals.find((d) => d.id === selectedId) ?? deals[0];
  const selectedIsOutreach = selected ? isOutreachDeal(selected) : false;
  const selectedMatch = activeThesis && selected ? scoreThesisMatch(selected, activeThesis) : null;

  // Auto-switch pipeline tab to the one containing the selected deal (deep links, decks arriving, etc.)
  useEffect(() => {
    if (!selected) return;
    const belongs = isOutreachDeal(selected) ? "outreach" : "decision";
    if (belongs !== pipelineTab) setPipelineTab(belongs);
     // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, selected?.pipelineStage]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopNav />
      <ThesisEngine activeThesis={activeThesis} />
      <SearchBar q={q ?? ""} setQuery={setQuery} nl={nl} />
      <MetricsStrip metrics={metricsQ.data} loading={metricsQ.isLoading} error={!!metricsQ.error}
        onSearch={setQuery} />
      <main className="mx-auto grid max-w-[1600px] grid-cols-1 gap-4 px-4 py-4 lg:grid-cols-[minmax(360px,35%)_1fr]">
        <LeftPane
          decisionItems={decisionList}
          outreachItems={outreachList}
          wishlistItems={wishlist}
          nlMatches={nl}
          selectedId={selectedId}
          onSelect={setSelected}
          tab={pipelineTab}
          onTab={(t) => {
            setPipelineTab(t);
            const nextList = t === "decision" ? decisionList : t === "outreach" ? outreachList : wishlist;
            if (nextList[0]) setSelected(nextList[0].deal.id);
          }}
          founderMap={founderMap}
          reshuffleKey={activeThesis ? `${activeThesis.id}:${activeThesis.risk}` : "none"}
        />
        {selected ? (selectedIsOutreach ? (
          <OutreachPane deal={selected} founderMap={founderMap} />
        ) : (
          <RightPane
            deal={selected}
            thesis={activeThesis}
            thesisMatch={selectedMatch}
            tab={tab}
            onTab={setTab}
            founderMap={founderMap}
            openClaimId={openClaimId}
            onOpenClaim={setClaim}
          />
        )) : (
          <div className="grid h-[calc(100vh-8rem)] place-items-center rounded-xl border border-border bg-card text-sm text-muted-foreground">
            {dealsQuery.isLoading ? "Loading dealflow..."
              : dealsQuery.error ? "Backend unreachable — start the API and reload."
              : "No deals match your thesis or search."}
          </div>
        )}
      </main>
      <section className="mx-auto max-w-[1600px] px-4 pb-8">
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="text-xs font-semibold tracking-tight">Recent activity</span>
            <Link to="/feed" className="text-[11px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Open Sourcing Feed →</Link>
          </div>
          <SourcingFeed limit={6} />
        </div>
      </section>
    </div>
  );
}

/* ── Hero metrics strip — the loading dock. Every tile clicks through. ── */

function MetricsStrip({ metrics, loading, error, onSearch }: {
  metrics?: Metrics; loading: boolean; error: boolean; onSearch: (q?: string) => void;
}) {
  const navigate = useNavigate();
  if (error) {
    return (
      <div className="border-b border-border bg-surface-1/40 px-4 py-2 text-center text-[11px] text-danger">
        Metrics unavailable — backend unreachable. Deal data below may be stale.
      </div>
    );
  }
  const tiles: { label: string; value: string; sub: string; onClick?: () => void }[] = metrics ? [
    { label: "Pending deals", value: String(metrics.pendingCount), sub: "in the funnel" },
    { label: "Decided", value: String(metrics.decidedCount), sub: "review & audit",
      onClick: () => navigate({ to: "/decisions" }) },
    { label: "Signal → decision", value: metrics.medianSignalToDecisionHours != null ? `${metrics.medianSignalToDecisionHours}h` : "—",
      sub: "median, target <24h", onClick: () => navigate({ to: "/decisions" }) },
    { label: "Contradictions caught", value: String(metrics.contradictionsCaught), sub: "quote-verified",
      onClick: () => onSearch("deals with contradictions") },
    { label: "Cold-start", value: String(metrics.coldStartCount), sub: "first-class, wider CI",
      onClick: () => onSearch("cold-start founders") },
    { label: "Real-sourced", value: String(metrics.realSourcedCount), sub: "live HN + GitHub",
      onClick: () => navigate({ to: "/feed" }) },
  ] : [];
  return (
    <div className="border-b border-border bg-surface-1/40">
      <div className="mx-auto grid max-w-[1600px] grid-cols-2 gap-px overflow-hidden px-4 py-2 sm:grid-cols-3 lg:grid-cols-6">
        {loading && !metrics
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="animate-pulse px-3 py-2"><div className="h-3 w-16 rounded bg-surface-2" /><div className="mt-2 h-5 w-10 rounded bg-surface-2" /></div>
            ))
          : tiles.map((t) => (
              <button key={t.label} onClick={t.onClick} disabled={!t.onClick}
                className={cn("rounded-md px-3 py-2 text-left transition-colors", t.onClick && "hover:bg-surface-2")}>
                <div className="text-[9px] uppercase tracking-widest text-muted-foreground">{t.label}</div>
                <div className="mt-0.5 flex items-baseline gap-1.5">
                  <span className="font-mono text-lg font-bold leading-none">{t.value}</span>
                  <span className="text-[10px] text-muted-foreground">{t.sub}</span>
                </div>
              </button>
            ))}
      </div>
    </div>
  );
}

/* ── Thesis Engine bar (with saved theses + activate + save-new) ── */

function ThesisEngine({ activeThesis }: { activeThesis?: Thesis }) {
  const qc = useQueryClient();
  const thesesQ = useQuery({ queryKey: ["theses"], queryFn: () => api.listTheses() });
  const [saveOpen, setSaveOpen] = useState(false);

  const applyThesis = async (id: string) => {
    await api.setActiveThesis(id);
    qc.invalidateQueries({ queryKey: ["activeThesis"] });
    toast.success("Thesis activated");
  };

  const changeRisk = async (risk: Thesis["risk"]) => {
    if (!activeThesis || activeThesis.risk === risk) return;
    await api.saveThesis({ ...activeThesis, risk });
    qc.invalidateQueries({ queryKey: ["activeThesis"] });
    qc.invalidateQueries({ queryKey: ["theses"] });
    toast.success(`Risk set to ${risk} — re-ranking pipeline`);
  };

  return (
    <div className="border-b border-border bg-surface-1/60 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-2 px-4 py-2.5">
        <span className="mr-2 inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          <Target className="h-3 w-3" /> Thesis engine
        </span>
        <ThesisSelector theses={thesesQ.data ?? []} activeId={activeThesis?.id} onSelect={applyThesis} />
        {activeThesis && (
          <div className="hidden items-center gap-1.5 text-[11px] text-muted-foreground md:flex">
            <Badge>{activeThesis.sector}</Badge>
            <Badge>{activeThesis.stage}</Badge>
            <Badge>{activeThesis.geography}</Badge>
            <Badge>${(activeThesis.checkSize / 1000).toFixed(0)}K</Badge>
            <Badge tone="info">{activeThesis.ownershipTargetPct}% target</Badge>
            {activeThesis.excludedSectors.length > 0 && (
              <Badge tone="danger">excl: {activeThesis.excludedSectors.join(", ")}</Badge>
            )}
          </div>
        )}
        {activeThesis && (
          <div className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 p-0.5" role="group" aria-label="Risk appetite">
            <span className="pl-1.5 pr-1 text-[10px] uppercase tracking-widest text-muted-foreground">Risk</span>
            {RISK.map((r) => (
              <button
                key={r}
                onClick={() => changeRisk(r as Thesis["risk"])}
                className={cn(
                  "rounded px-2 py-1 text-[11px] font-medium transition-colors",
                  activeThesis.risk === r
                    ? "bg-info/20 text-info shadow-inner"
                    : "text-muted-foreground hover:bg-surface-3 hover:text-foreground",
                )}
              >
                {r}
              </button>
            ))}
          </div>
        )}
        <Popover open={saveOpen} onOpenChange={setSaveOpen}>
          <PopoverTrigger asChild>
            <button className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-xs hover:bg-surface-3">
              <Save className="h-3 w-3" /> Save new thesis
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="end">
            <SaveThesisForm onSaved={() => { setSaveOpen(false); qc.invalidateQueries({ queryKey: ["theses"] }); qc.invalidateQueries({ queryKey: ["activeThesis"] }); }} />
          </PopoverContent>
        </Popover>
        <div className="ml-auto text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
            Thesis-Match ranking active
          </span>
        </div>
      </div>
    </div>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone?: "info" | "danger" }) {
  const cls =
    tone === "info" ? "border-info/40 bg-info/10 text-info"
    : tone === "danger" ? "border-danger/40 bg-danger/10 text-danger"
    : "border-border bg-surface-2 text-muted-foreground";
  return <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-medium", cls)}>{children}</span>;
}

function ThesisSelector({ theses, activeId, onSelect }: { theses: Thesis[]; activeId?: string; onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const active = theses.find((t) => t.id === activeId);
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-1.5 text-xs hover:bg-surface-3">
        <span className="text-muted-foreground">Active</span>
        <span className="font-medium truncate max-w-[260px]">{active?.name ?? "—"}</span>
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 min-w-[280px] rounded-md border border-border bg-popover p-1 shadow-xl">
            {theses.map((t) => (
              <button key={t.id} onClick={() => { onSelect(t.id); setOpen(false); }}
                className={cn("block w-full rounded-sm px-2.5 py-1.5 text-left text-xs hover:bg-accent", t.id === activeId && "bg-accent")}>
                <div className="font-medium">{t.name}</div>
                <div className="text-[10px] text-muted-foreground">{t.sector} · {t.stage} · {t.geography} · {t.risk}</div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SaveThesisForm({ onSaved }: { onSaved: () => void }) {
  const [name, setName] = useState("");
  const [sector, setSector] = useState<string>("All Sectors");
  const [stage, setStage] = useState<string>("All Stages");
  const [geo, setGeo] = useState<string>("Global");
  const [risk, setRisk] = useState<Thesis["risk"]>("Balanced");
  const [checkSize, setCheckSize] = useState(100000);
  const [ownershipPct, setOwnershipPct] = useState(10);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [makeActive, setMakeActive] = useState(true);

  const toggleExcluded = (s: string) =>
    setExcluded((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);

  const submit = async () => {
    if (!name.trim()) { toast.error("Give the thesis a name"); return; }
    const t = await api.saveThesis({ name: name.trim(), sector, stage, geography: geo, risk, checkSize, excludedSectors: excluded, ownershipTargetPct: ownershipPct });
    if (makeActive) await api.setActiveThesis(t.id);
    toast.success(`Thesis "${t.name}" saved${makeActive ? " and activated" : ""}`);
    onSaved();
  };

  return (
    <div className="space-y-3 p-3 text-xs">
      <div>
        <div className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">Name</div>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="AI Infra Seed — Aggressive" className="h-9 bg-surface-1" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <SelectField label="Sector" value={sector} setValue={setSector} options={[...SECTORS]} />
        <SelectField label="Stage" value={stage} setValue={setStage} options={[...STAGES]} />
        <SelectField label="Geography" value={geo} setValue={setGeo} options={[...GEOS]} />
        <SelectField label="Risk" value={risk} setValue={(v) => setRisk(v as Thesis["risk"])} options={[...RISK]} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">Check size (USD)</div>
          <Input type="number" value={checkSize} onChange={(e) => setCheckSize(parseInt(e.target.value || "0", 10))} className="h-9 bg-surface-1" />
        </div>
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">Ownership target (%)</div>
          <Input type="number" step="0.5" value={ownershipPct} onChange={(e) => setOwnershipPct(parseFloat(e.target.value || "0"))} className="h-9 bg-surface-1" />
        </div>
      </div>
      <div>
        <div className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">Excluded sectors</div>
        <div className="flex flex-wrap gap-1">
          {EXCLUDABLE_SECTORS.map((s) => (
            <button key={s} type="button" onClick={() => toggleExcluded(s)}
              className={cn("rounded border px-1.5 py-0.5 text-[10px]",
                excluded.includes(s)
                  ? "border-danger/40 bg-danger/10 text-danger"
                  : "border-border bg-surface-2 text-muted-foreground hover:text-foreground")}>
              {s}
            </button>
          ))}
        </div>
      </div>
      <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <input type="checkbox" checked={makeActive} onChange={(e) => setMakeActive(e.target.checked)} /> Activate on save
      </label>
      <Button size="sm" className="w-full" onClick={submit}><Save className="mr-1 h-3 w-3" /> Save thesis</Button>
    </div>
  );
}

function SelectField({ label, value, setValue, options }: { label: string; value: string; setValue: (v: string) => void; options: string[] }) {
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <select value={value} onChange={(e) => setValue(e.target.value)} className="h-9 w-full rounded-md border border-border bg-surface-1 px-2 text-xs">
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

/* ── Search bar with chips ── */

function SearchBar({ q, setQuery, nl }: { q: string; setQuery: (v?: string) => void; nl: NLSearchResult | null }) {
  const [draft, setDraft] = useState(q);
  useEffect(() => { setDraft(q); }, [q]);
  const submit = () => setQuery(draft.trim() || undefined);
  const clear = () => { setDraft(""); setQuery(undefined); };

  const chips = nl ? criteriaToChips(nl.criteria) : [];
  const removeChip = (key: keyof NLCriteria) => {
    if (!nl) return;
    const c = { ...nl.criteria };
    delete (c as Record<string, unknown>)[key];
    const rebuilt = rebuildQuery(c);
    setQuery(rebuilt || undefined);
    setDraft(rebuilt);
  };

  return (
    <div className="border-b border-border bg-background/60">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-2 px-4 py-2.5">
        <div className="relative flex-1 min-w-[280px] max-w-2xl">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") clear(); }}
            placeholder='Natural-language search: e.g. "AI Infra seed with verified pilots" or "cold-start devtools founders"'
            className="h-9 bg-surface-1 pl-9 pr-24"
          />
          <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-1">
            {q && <button onClick={clear} className="rounded p-1 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>}
            <Button size="sm" className="h-7 px-2 text-[11px]" onClick={submit}>Search</Button>
          </div>
        </div>
        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Parsed</span>
            {chips.map((c) => (
              <button key={c.key} onClick={() => removeChip(c.key)}
                className="inline-flex items-center gap-1 rounded-md border border-info/40 bg-info/10 px-2 py-0.5 text-[11px] text-info hover:bg-info/20">
                {c.label} <X className="h-3 w-3" />
              </button>
            ))}
          </div>
        )}
        {nl && (
          <div className="ml-auto text-[11px] text-muted-foreground">
            {nl.deals.length} deals · {nl.founders.length} founders match
          </div>
        )}
      </div>
    </div>
  );
}

function criteriaToChips(c: NLCriteria): { key: keyof NLCriteria; label: string }[] {
  const out: { key: keyof NLCriteria; label: string }[] = [];
  if (c.sector) out.push({ key: "sector", label: `Sector: ${c.sector}` });
  if (c.stage) out.push({ key: "stage", label: `Stage: ${c.stage}` });
  if (c.geography) out.push({ key: "geography", label: `Geo: ${c.geography}` });
  if (c.minFounderScore != null) out.push({ key: "minFounderScore", label: `Score ≥ ${c.minFounderScore}` });
  if (c.coldStart) out.push({ key: "coldStart", label: "Cold-start" });
  if (c.verifiedOnly) out.push({ key: "verifiedOnly", label: "Verified only" });
  if (c.hasContradictions) out.push({ key: "hasContradictions", label: "Has contradictions" });
  if (c.keyword) out.push({ key: "keyword", label: `"${c.keyword}"` });
  return out;
}
function rebuildQuery(c: NLCriteria): string {
  const parts: string[] = [];
  if (c.sector) parts.push(c.sector);
  if (c.stage) parts.push(c.stage);
  if (c.geography) parts.push(c.geography);
  if (c.minFounderScore != null) parts.push(`score over ${c.minFounderScore}`);
  if (c.coldStart) parts.push("cold-start");
  if (c.verifiedOnly) parts.push("verified");
  if (c.hasContradictions) parts.push("contradictions");
  if (c.keyword) parts.push(c.keyword);
  return parts.join(" ");
}

/* ── Left Pane ── */

type Ranked = { deal: Deal; thesisMatch: ThesisMatch };
type PipelineTabKey = "decision" | "outreach" | "wishlist";

const PAGE_SIZE = 12;

function LeftPane({ decisionItems, outreachItems, wishlistItems, nlMatches, selectedId, onSelect, tab, onTab, founderMap, reshuffleKey }: {
  decisionItems: Ranked[]; outreachItems: Ranked[]; wishlistItems: Ranked[];
  nlMatches: NLSearchResult | null;
  selectedId: string; onSelect: (id: string) => void;
  tab: PipelineTabKey; onTab: (t: PipelineTabKey) => void;
  founderMap: Map<string, Founder>;
  reshuffleKey: string;
}) {
  const [stageFilter, setStageFilter] = useState("All");
  const [sectorFilter, setSectorFilter] = useState("All");
  const [coldOnly, setColdOnly] = useState(false);
  const [highSignal, setHighSignal] = useState(false);
  const [visible, setVisible] = useState(PAGE_SIZE);

  const matchById = useMemo(() => {
    const m = new Map<string, { match: number; why: string[] }>();
    if (nlMatches) for (const d of nlMatches.deals) m.set(d.deal.id, { match: d.match, why: d.why });
    return m;
  }, [nlMatches]);

  const base = tab === "decision" ? decisionItems : tab === "outreach" ? outreachItems : wishlistItems;
  const stages = useMemo(() => ["All", ...Array.from(new Set(base.map((r) => r.deal.pipelineStage)))], [base]);
  const sectors = useMemo(() => ["All", ...Array.from(new Set(base.map((r) => r.deal.sector)))], [base]);
  const items = useMemo(() => base.filter((r) =>
    (stageFilter === "All" || r.deal.pipelineStage === stageFilter) &&
    (sectorFilter === "All" || r.deal.sector === sectorFilter) &&
    (!coldOnly || r.deal.isColdStart) &&
    (!highSignal || r.deal.verifications >= 1)), [base, stageFilter, sectorFilter, coldOnly, highSignal]);
  useEffect(() => { setVisible(PAGE_SIZE); }, [tab, stageFilter, sectorFilter, coldOnly, highSignal, reshuffleKey]);

  const emptyHint = tab === "decision"
    ? "No decision-ready deals match. Applied and sourced-with-decks appear here."
    : tab === "outreach"
    ? "No outbound leads awaiting outreach. Run a scan from the Sourcing Feed to discover more."
    : "Nothing on the wishlist yet — star deals here or shortlist them in Triage.";

  return (
    <aside className="flex h-[calc(100vh-8rem)] flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border">
        <div className="flex">
          <TabBtn active={tab === "decision"} onClick={() => onTab("decision")}>
            <Rocket className="mr-1.5 inline h-3 w-3 text-info" />
            Decision-Ready
            <span className="ml-1.5 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-mono">{decisionItems.length}</span>
          </TabBtn>
          <TabBtn active={tab === "outreach"} onClick={() => onTab("outreach")}>
            <Signal className="mr-1.5 inline h-3 w-3 text-warning" />
            Outreach
            <span className="ml-1.5 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-mono">{outreachItems.length}</span>
          </TabBtn>
          <TabBtn active={tab === "wishlist"} onClick={() => onTab("wishlist")}>
            <Star className="mr-1.5 inline h-3 w-3 text-warning" />
            Wishlist
            <span className="ml-1.5 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-mono">{wishlistItems.length}</span>
          </TabBtn>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2">
          <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}
            className="h-6 rounded border border-border bg-surface-1 px-1 text-[10px] text-muted-foreground">
            {stages.map((s) => <option key={s} value={s}>{s === "All" ? "All stages" : s}</option>)}
          </select>
          <select value={sectorFilter} onChange={(e) => setSectorFilter(e.target.value)}
            className="h-6 rounded border border-border bg-surface-1 px-1 text-[10px] text-muted-foreground">
            {sectors.map((s) => <option key={s} value={s}>{s === "All" ? "All sectors" : s}</option>)}
          </select>
          <FilterChip active={coldOnly} onClick={() => setColdOnly((v) => !v)}>Cold-start</FilterChip>
          <FilterChip active={highSignal} onClick={() => setHighSignal((v) => !v)}>High-signal</FilterChip>
          <span className="ml-auto text-[10px] text-muted-foreground">{items.length} deal{items.length === 1 ? "" : "s"}</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div key={`${tab}:${reshuffleKey}`}>
          {items.length === 0 ? (
            <div className="p-6 text-xs text-muted-foreground">{emptyHint}</div>
          ) : items.slice(0, visible).map((r, idx) => (
            <div
              key={r.deal.id}
              className="animate-fade-in"
              style={{ animationDelay: `${Math.min(idx, 8) * 40}ms`, animationFillMode: "both" }}
            >
              {tab === "outreach" ? (
                <OutreachCard
                  deal={r.deal}
                  signalStrength={computeSignalStrength(r.deal, founderMap)}
                  nlMatch={matchById.get(r.deal.id)}
                  selected={r.deal.id === selectedId}
                  onClick={() => onSelect(r.deal.id)}
                />
              ) : (
                <DealCard
                  deal={r.deal}
                  thesisMatch={r.thesisMatch}
                  nlMatch={matchById.get(r.deal.id)}
                  selected={r.deal.id === selectedId}
                  onClick={() => onSelect(r.deal.id)}
                />
              )}
            </div>
          ))}
          {items.length > visible && (
            <button onClick={() => setVisible((v) => v + PAGE_SIZE)}
              className="block w-full border-t border-border p-3 text-center text-[11px] text-muted-foreground hover:bg-surface-1 hover:text-foreground">
              Load {Math.min(PAGE_SIZE, items.length - visible)} more · {items.length - visible} remaining
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={cn("rounded border px-1.5 py-0.5 text-[10px] transition-colors",
      active ? "border-info/50 bg-info/10 text-info" : "border-border bg-surface-1 text-muted-foreground hover:text-foreground")}>
      {children}
    </button>
  );
}

/* ── Outreach card (sourced leads, no deck yet) ── */

function OutreachCard({ deal, signalStrength, nlMatch, selected, onClick }: {
  deal: Deal; signalStrength: number;
  nlMatch?: { match: number; why: string[] };
  selected: boolean; onClick: () => void;
}) {
  const outreachQ = useQuery({
    queryKey: ["outreachState", deal.id],
    queryFn: () => api.getOutreachState(deal.id),
  });
  const sent = outreachQ.data?.status === "sent";
  const tone = signalStrength >= 75 ? "text-success border-success/40 bg-success/10"
    : signalStrength >= 55 ? "text-warning border-warning/40 bg-warning/10"
    : "text-muted-foreground border-border bg-surface-2";
  return (
    <button onClick={onClick} className={cn("block w-full border-b border-border p-4 text-left transition-colors", selected ? "bg-surface-2" : "hover:bg-surface-1")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold">{deal.company}</h3>
            {deal.isColdStart && (
              <span className="shrink-0 rounded border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-warning">Cold-Start</span>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{deal.tagline}</p>
        </div>
        <div className={cn("shrink-0 rounded-md border px-2 py-1 text-center font-mono", tone)} title="AI Interest — signal strength from public footprint">
          <div className="flex items-center justify-center gap-1 text-[9px] uppercase tracking-widest opacity-80">
            <Signal className="h-2.5 w-2.5" /> AI Interest
          </div>
          <div className="text-base font-bold leading-none">{signalStrength}</div>
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span className="rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted-foreground">{deal.source}</span>
        <span className="rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted-foreground">{deal.sector} · {deal.geography}</span>
        {sent ? (
          <span className="inline-flex items-center gap-1 rounded border border-info/40 bg-info/10 px-1.5 py-0.5 text-[10px] font-medium text-info">
            <Hourglass className="h-3 w-3" /> Awaiting Pitch Deck
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-warning">
            <Mail className="h-3 w-3" /> Draft ready
          </span>
        )}
        {nlMatch && (
          <span className="rounded border border-info/40 bg-info/10 px-1.5 py-0.5 text-[10px] font-mono text-info" title={nlMatch.why.join(" · ")}>
            search {nlMatch.match}%
          </span>
        )}
      </div>

      <p className="mt-3 text-[11px] italic text-muted-foreground">No deck yet — seduce first, evaluate later.</p>
    </button>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={cn("flex-1 border-b-2 px-4 py-3 text-xs font-medium transition-colors", active ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
      {children}
    </button>
  );
}

/* ── Outreach Pane (right side, for sourced leads without a deck) ── */

function OutreachPane({ deal, founderMap }: { deal: Deal; founderMap: Map<string, Founder> }) {
  const qc = useQueryClient();
  const draftQ = useQuery({ queryKey: ["outreachDraft", deal.id], queryFn: () => api.getOutreachDraft(deal.id) });
  const stateQ = useQuery({ queryKey: ["outreachState", deal.id], queryFn: () => api.getOutreachState(deal.id) });
  const [sending, setSending] = useState(false);
  const [bodyDraft, setBodyDraft] = useState<string | null>(null);
  useEffect(() => { setBodyDraft(null); setSubjectDraft(null); }, [deal.id]);

  const draft = draftQ.data;
  const state = stateQ.data ?? { status: "not_sent" as const };
  const founders = deal.founderIds.map((id) => founderMap.get(id)).filter(Boolean) as Founder[];
  const primary = [...founders].sort((a, b) => b.founderScore - a.founderScore)[0];
  // Display values come from the backend draft when live; client formula is the fallback.
  const strength = draft?.signalStrength ?? computeSignalStrength(deal, founderMap);
  const [subjectDraft, setSubjectDraft] = useState<string | null>(null);
  const body = bodyDraft ?? draft?.body ?? "";
  const subject = subjectDraft ?? draft?.subject ?? "";

  // Prefer the backend's transparent breakdown (live mode); mirror it client-side otherwise.
  const teamMax = Math.max(0, ...founders.map((f) => f.founderScore));
  const marketScore = deal.market.rating === "Bullish" ? 82 : deal.market.rating === "Neutral" ? 60 : 40;
  const verifiedClaims = deal.claims.filter((c) => c.status === "verified").length;
  const trendPts = deal.ideaVsMarket.trend === "up" ? 6 : deal.ideaVsMarket.trend === "down" ? -4 : 0;
  const breakdown: { label: string; detail: string; points: number }[] =
    draft?.signals?.length
      ? draft.signals.map((s) => ({ label: s.label, detail: s.detail, points: s.points ?? 0 }))
      : [
    { label: "Founder Signal (Team max)",
      detail: primary ? `${primary.name} · Founder score ${primary.founderScore}` : "No founder profile matched",
      points: Math.round(teamMax * 0.45) },
    { label: "Market Sentiment",
      detail: `${deal.market.rating} · ${deal.sector}`,
      points: Math.round(marketScore * 0.20) },
    { label: "Verified Public Claims",
      detail: verifiedClaims > 0 ? `${verifiedClaims} claim${verifiedClaims === 1 ? "" : "s"} cross-checked against public sources` : "No verified public claims yet",
      points: verifiedClaims * 6 },
    { label: "Momentum (Idea vs Market trend)",
      detail: deal.ideaVsMarket.trend === "up" ? "Improving — recent traction detected" : deal.ideaVsMarket.trend === "down" ? "Cooling — public signal weakening" : "Flat — no directional signal",
      points: trendPts },
    { label: "Baseline outbound interest",
      detail: `Surfaced via ${deal.source}`,
      points: 18 },
  ];

  // Pitch deck / GitHub / Website link resolution (graceful when absent).
  const linkByLabel = (needle: RegExp) => deal.links.find((l) => needle.test(l.label));
  const deckLink = linkByLabel(/deck/i);
  const githubLink = linkByLabel(/github/i);
  const websiteLink = linkByLabel(/website|site|url/i);
  const hasDeck = !!deckLink?.href;

  const [simulating, setSimulating] = useState(false);
  const simulateApp = async () => {
    setSimulating(true);
    try {
      await api.simulateApplication(deal.id);
      toast.success("Simulated application received (demo) — full pipeline ran; deal moved to Decision-Ready");
      qc.invalidateQueries({ queryKey: ["deals"] });
      qc.invalidateQueries({ queryKey: ["founders"] });
      qc.invalidateQueries({ queryKey: ["metrics"] });
    } catch { toast.error("Simulation failed — is the backend running?"); }
    finally { setSimulating(false); }
  };

  const send = async () => {
    setSending(true);
    try {
      await api.sendOutreach(deal.id, { channel: "Email", subject, body });
      qc.invalidateQueries({ queryKey: ["outreachState", deal.id] });
      qc.invalidateQueries({ queryKey: ["deals"] });
      toast.success(`Simulated send recorded for ${primary?.name ?? deal.company} — nothing left the system`);
    } catch { toast.error("Could not record outreach send"); }
    finally { setSending(false); }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(body); toast.success("Email copied"); }
    catch { toast.error("Copy failed"); }
  };

  return (
    <section className="flex h-[calc(100vh-8rem)] flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border bg-surface-1/50 px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-warning">
                Outreach Pipeline
              </span>
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">No deck yet · Seduce mode</span>
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">{deal.company}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{deal.tagline}</p>
            <p className="mt-1 text-xs text-muted-foreground">{deal.sector} · {deal.stage} · {deal.geography} · <span className="italic">{deal.source}</span></p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {githubLink?.href ? (
                <a href={githubLink.href} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 px-2 py-1 text-[11px] text-foreground/90 hover:bg-surface-1">
                  <ExternalLink className="h-3 w-3" /> GitHub
                </a>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-md border border-dashed border-border bg-surface-1 px-2 py-1 text-[11px] text-muted-foreground">
                  GitHub: [Data not available in public footprint]
                </span>
              )}
              {websiteLink?.href ? (
                <a href={websiteLink.href} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 px-2 py-1 text-[11px] text-foreground/90 hover:bg-surface-1">
                  <ExternalLink className="h-3 w-3" /> Website
                </a>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-md border border-dashed border-border bg-surface-1 px-2 py-1 text-[11px] text-muted-foreground">
                  Website: [Data not available in public footprint]
                </span>
              )}
              {hasDeck ? (
                <a href={deckLink!.href!} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-info/40 bg-info/10 px-2 py-1 text-[11px] font-medium text-info hover:bg-info/20">
                  <FileText className="h-3 w-3" /> View Pitch Deck
                </a>
              ) : (
                <span
                  aria-disabled="true"
                  title="No pitch deck submitted yet — outreach required"
                  className="inline-flex cursor-not-allowed items-center gap-1 rounded-md border border-dashed border-border bg-surface-1 px-2 py-1 text-[11px] uppercase tracking-wider text-muted-foreground/80"
                >
                  <FileText className="h-3 w-3 opacity-60" /> Pitch Deck: Not Provided (Outreach Required)
                </span>
              )}
            </div>
          </div>
          <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-center font-mono text-warning">
            <div className="flex items-center justify-center gap-1 text-[9px] uppercase tracking-widest opacity-80">
              <Signal className="h-3 w-3" /> Signal Strength
            </div>
            <div className="text-2xl font-bold leading-none">{strength}</div>
            <div className="mt-1 text-[9px] uppercase tracking-widest opacity-70">AI Interest</div>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto px-6 pb-24 pt-6">
        {/* Signal Strength Breakdown — explains how the AI Interest score was derived. */}
        <SectionCard
          title="Signal Strength Breakdown"
          subtitle="How the AI Interest score was derived from public footprint."
          right={
            <span className="rounded-md border border-warning/40 bg-warning/10 px-2 py-1 font-mono text-[11px] font-bold text-warning">
              {strength} / 100
            </span>
          }
        >
          <div className="space-y-2 p-4">
            <div className="grid gap-2 sm:grid-cols-2">
              {breakdown.map((b) => {
                const positive = b.points >= 0;
                return (
                  <div key={b.label} className="flex items-start justify-between gap-3 rounded-md border border-border bg-surface-1 p-3">
                    <div className="min-w-0">
                      <div className="text-[11px] font-medium uppercase tracking-wider text-foreground/90">{b.label}</div>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{b.detail}</p>
                    </div>
                    <span className={cn(
                      "shrink-0 rounded border px-2 py-0.5 font-mono text-[11px] font-bold",
                      positive ? "border-success/40 bg-success/10 text-success" : "border-danger/40 bg-danger/10 text-danger",
                    )}>
                      {positive ? "+" : ""}{b.points} pts
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="pt-2 text-[11px] italic leading-relaxed text-muted-foreground">
              Score derived entirely from public footprint and external signals. Full 3-Axis screening pending pitch deck submission.
            </p>
          </div>
        </SectionCard>

        {/* Public signals summary */}
        <SectionCard title="Public signals" subtitle="Why this lead surfaced in the outbound scan.">
          <ul className="space-y-2">
            {(draft?.signals ?? []).length === 0 && (
              <li className="rounded-md border border-dashed border-border bg-surface-1 p-3 text-xs text-muted-foreground">
                [Data not available in public footprint]
              </li>
            )}
            {(draft?.signals ?? []).map((s, i) => (
              <li key={i} className="flex items-start gap-3 rounded-md border border-border bg-surface-1 p-3">
                <span className="mt-0.5 rounded border border-info/40 bg-info/10 px-1.5 py-0.5 font-mono text-[10px] text-info">{s.label}</span>
                <p className="text-xs leading-relaxed text-foreground/90">{s.detail}</p>
              </li>
            ))}
            {primary ? (
              <li className="flex items-start gap-3 rounded-md border border-border bg-surface-1 p-3">
                <span className="mt-0.5 rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">Founder</span>
                <p className="text-xs leading-relaxed text-foreground/90">
                  <span className="font-medium text-foreground">{primary.name}</span> — {primary.bio}
                </p>
              </li>
            ) : (
              <li className="flex items-start gap-3 rounded-md border border-dashed border-border bg-surface-1 p-3 text-xs text-muted-foreground">
                Founder profile: [Data not available in public footprint]
              </li>
            )}
          </ul>
        </SectionCard>

        {/* Personalized outreach email */}
        <SectionCard
          title="AI-generated outreach email"
          subtitle="Hyper-personalized from public signals. Edit before sending."
          right={
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={copy}><Copy className="mr-1 h-3 w-3" /> Copy</Button>
              {state.status === "sent" && (
                <span className="inline-flex items-center gap-1 rounded-md border border-info/40 bg-info/10 px-2 py-1 text-[10px] font-medium text-info">
                  <Hourglass className="h-3 w-3" /> Awaiting Pitch Deck
                </span>
              )}
            </div>
          }
        >
          {!draft ? (
            <div className="p-4 text-xs text-muted-foreground">Generating personalized draft…</div>
          ) : (
            <div className="space-y-3 rounded-lg border border-border bg-surface-1 p-4">
              <div>
                <div className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">To</div>
                <div className="font-mono text-xs">{primary?.email ?? "founder@—"}</div>
              </div>
              <div>
                <div className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">Subject</div>
                <Input value={subject} onChange={(e) => setSubjectDraft(e.target.value)} className="h-8 bg-surface-2 font-mono text-xs" />
              </div>
              <div>
                <div className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">Body</div>
                <Textarea
                  value={body}
                  onChange={(e) => setBodyDraft(e.target.value)}
                  rows={12}
                  className="bg-surface-2 font-mono text-[12px] leading-relaxed"
                />
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      {/* Sticky action bar (replaces the $100K decision terminal for outreach leads) */}
      <div className="border-t border-border bg-surface-1/80 px-6 py-4 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 text-xs text-muted-foreground">
            {state.status === "sent" ? (
              <span className="inline-flex items-center gap-2">
                <Hourglass className="h-3.5 w-3.5 text-info" />
                Outreach sent {state.sentAt ? new Date(state.sentAt).toLocaleString() : ""} · Deal auto-promotes when a deck arrives.
              </span>
            ) : (
              <span className="inline-flex items-center gap-2">
                <Info className="h-3.5 w-3.5" /> No 24-hour clock here — this lead has no deck. Approve $100K unlocks after they apply.
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {state.status === "sent" && (
              <Button size="sm" variant="outline" onClick={simulateApp} disabled={simulating}
                title="DEMO: constructs an application from this lead's real public footprint and runs the full inbound pipeline (≈60–120s)"
                className="border-warning/50 text-warning hover:bg-warning/10">
                {simulating ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Sparkles className="mr-1 h-3 w-3" />}
                {simulating ? "Running full pipeline…" : "Simulate application received (demo)"}
              </Button>
            )}
            {state.status === "sent" ? (
              <Button size="sm" variant="outline" onClick={send} disabled={sending}>
                {sending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />} Send follow-up
              </Button>
            ) : (
              <Button size="sm" onClick={send} disabled={sending || !draft}>
                {sending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
                Review &amp; Send Outreach Email
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function DealCard({ deal, thesisMatch, nlMatch, selected, onClick }: {
  deal: Deal; thesisMatch: ThesisMatch;
  nlMatch?: { match: number; why: string[] };
  selected: boolean; onClick: () => void;
}) {
  return (
    <div role="button" tabIndex={0} onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      className={cn("block w-full cursor-pointer border-b border-border p-4 text-left transition-colors", selected ? "bg-surface-2" : "hover:bg-surface-1")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold">{deal.company}</h3>
            {deal.isColdStart && (
              <span className="shrink-0 rounded border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-warning">Cold-Start</span>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {deal.founderIds.length} founder{deal.founderIds.length === 1 ? "" : "s"} · {deal.stage} · {deal.geography}
          </p>
        </div>
        <ThesisMatchBadge match={thesisMatch} />
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span className="rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted-foreground">{deal.source}</span>
        <span className="rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted-foreground">{deal.pipelineStage}</span>
        {isHighUpside(deal) && (
          <span className="inline-flex items-center gap-1 rounded border border-warning/50 bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-warning" title={HIGH_UPSIDE_TOOLTIP}>
            <Sparkles className="h-3 w-3" /> High Upside · High Risk
          </span>
        )}
        {nlMatch && (
          <span className="rounded border border-info/40 bg-info/10 px-1.5 py-0.5 text-[10px] font-mono text-info" title={nlMatch.why.join(" · ")}>
            search {nlMatch.match}%
          </span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-1.5">
        {/* Team tile = the backend's founder AXIS (team-in-context) — never an individual score */}
        <AxisChip label="Team" score={deal.founderAxis.score} trend={deal.founderAxis.trend} />
        <AxisChip label="Market" score={ratingToScore(deal.market.rating)} trend={deal.market.trend} custom={deal.market.rating} />
        <AxisChip label="Idea/Mkt" score={deal.ideaVsMarket.score} trend={deal.ideaVsMarket.trend} />
      </div>

      <div className="mt-3 flex items-center gap-3 text-[11px]">
        <span className="inline-flex items-center gap-1 text-success">
          <span className="h-1.5 w-1.5 rounded-full bg-success" /> {deal.verifications} Verified
        </span>
        {deal.alerts > 0 && (
          <span className="inline-flex items-center gap-1 text-danger">
            <span className="h-1.5 w-1.5 rounded-full bg-danger" /> {deal.alerts} Alert{deal.alerts > 1 ? "s" : ""}
          </span>
        )}
      </div>
    </div>
  );
}

function ThesisMatchBadge({ match }: { match: ThesisMatch }) {
  const color = match.score >= 75 ? "text-info border-info/50 bg-info/10"
    : match.score >= 50 ? "text-info/80 border-info/30 bg-info/5"
    : "text-danger border-danger/40 bg-danger/10";
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className={cn("shrink-0 rounded-md border border-dashed px-2 py-1 text-center font-mono hover:brightness-110", color)}
          title="Thesis Match — rule-gate fit only; the three axes never enter this formula"
        >
          <div className="text-[9px] uppercase tracking-widest opacity-80 flex items-center justify-center gap-1">
            <Target className="h-2.5 w-2.5" /> Thesis Match
          </div>
          <div className="text-base font-bold leading-none">{match.score}%</div>
        </button>
      </PopoverTrigger>
      <PopoverContent side="right" align="start" className="w-72 p-3 text-xs">
        <div className="mb-2 flex items-center justify-between">
          <div className="font-medium">Thesis-match breakdown</div>
          <span className="font-mono">{match.score}/100</span>
        </div>
        <p className="mb-2 text-[10px] text-muted-foreground">
          Rule gates only — sector, stage, geography, check size, ownership, risk.
          The three axes never enter this formula.
        </p>
        <ul className="space-y-1">
          {match.rules.map((r, i) => (
            <li key={i} className="flex items-baseline justify-between gap-2 border-t border-border pt-1">
              <span className="text-foreground/90">{r.label}</span>
              <span className={cn("font-mono uppercase text-[9px] tracking-wider",
                r.status === "match" ? "text-success" : r.status === "mismatch" ? "text-danger" : "text-muted-foreground")}>
                {r.status}{r.status === "match" ? ` +${r.weight}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function AxisChip({ label, score, trend, custom }: { label: string; score: number; trend: Trend; custom?: string }) {
  const tone = score >= 75 ? "border-success/30 bg-success/5 text-success"
    : score >= 55 ? "border-warning/30 bg-warning/5 text-warning"
    : "border-danger/30 bg-danger/5 text-danger";
  return (
    <div className={cn("flex flex-col rounded-md border px-2 py-1.5", tone)}>
      <div className="flex items-center justify-between text-[9px] uppercase tracking-widest opacity-80">{label}<TrendIcon t={trend} /></div>
      <div className="mt-0.5 font-mono text-xs font-bold">{custom ?? score}</div>
    </div>
  );
}

function TrendIcon({ t }: { t: Trend }) {
  if (t === "up") return <ArrowUpRight className="h-3 w-3" />;
  if (t === "down") return <ArrowDownRight className="h-3 w-3" />;
  return <ArrowRight className="h-3 w-3" />;
}

function ratingToScore(r: MarketRating): number { return r === "Bullish" ? 82 : r === "Neutral" ? 60 : 40; }

function SourcingFeed({ limit }: { limit?: number }) {
  const { data, error } = useQuery({ queryKey: ["sourcing"], queryFn: () => api.listSourcing() });
  if (error) return <div className="p-6 text-xs text-danger">Sourcing feed unavailable — backend unreachable.</div>;
  if (!data) return <div className="p-6 text-xs text-muted-foreground">Loading feed...</div>;
  return (
    <div className="divide-y divide-border">
      {(limit ? data.slice(0, limit) : data).map((it) => (
        <div key={it.id} className="p-3 ticker-fade-in">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
            <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono">{it.source}</span>
            <span>{it.time} ago</span>
          </div>
          <p className="mt-1.5 text-xs leading-snug text-foreground/90">{it.text}</p>
        </div>
      ))}
      <div className="p-3 text-center text-[11px] text-muted-foreground">
        <Link to="/feed" className="underline-offset-4 hover:underline">Open full Sourcing Feed →</Link>
      </div>
    </div>
  );
}

/* ── Right Pane (tabbed) ── */

function RightPane({ deal, thesis, thesisMatch, tab, onTab, founderMap, openClaimId, onOpenClaim }: {
  deal: Deal; thesis?: Thesis; thesisMatch: ThesisMatch | null;
  tab: TabKey; onTab: (t: TabKey) => void;
  founderMap: Map<string, Founder>;
  openClaimId?: string; onOpenClaim: (id?: string) => void;
}) {
  const founders = deal.founderIds.map((id) => founderMap.get(id)).filter(Boolean) as Founder[];
  const openClaim = openClaimId ? deal.claims.find((c) => c.id === openClaimId) : undefined;

  return (
    <section className="flex h-[calc(100vh-8rem)] flex-col overflow-hidden rounded-xl border border-border bg-card">
      <Header deal={deal} />
      <TabsBar tab={tab} onTab={onTab} counts={{ team: founders.length, trust: deal.claims.length }} />
      <div className="flex-1 overflow-y-auto px-6 pb-40 pt-6">
        {tab === "overview" && <OverviewTab deal={deal} thesisMatch={thesisMatch} />}
        {tab === "team" && <TeamTab deal={deal} founders={founders} />}
        {tab === "trust" && <TrustTab deal={deal} onOpenClaim={onOpenClaim} />}
        {tab === "memo" && <MemoTab deal={deal} />}
        {tab === "receipts" && <ReceiptsTab deal={deal} />}
        {tab === "decision" && <DecisionTab deal={deal} thesis={thesis} />}
      </div>
      {tab !== "decision" && <DecisionTerminal deal={deal} thesis={thesis} onOpenDecision={() => onTab("decision")} />}
      <ClaimSheet deal={deal} claim={openClaim} onClose={() => onOpenClaim(undefined)} />
    </section>
  );
}

function Header({ deal }: { deal: Deal }) {
  const activeLinks = deal.links.filter((l) => l.href);
  const missingLinks = deal.links.filter((l) => !l.href);
  return (
    <div className="border-b border-border bg-surface-1/50 px-6 py-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{deal.company}</h1>
            {deal.isColdStart && (
              <span className="rounded-md border border-warning/40 bg-warning/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-warning">Cold-Start Founder</span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{deal.tagline}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {deal.sector} · {deal.stage} · {deal.geography} · <span className="italic">{deal.source}</span>
          </p>
        </div>
        <div className="flex max-w-full flex-wrap items-center gap-2">
          {activeLinks.map((l) => (
            <a key={l.label} href={l.href as string} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-xs text-foreground/90 hover:bg-surface-3">
              {l.label} <ExternalLink className="h-3 w-3 text-muted-foreground" />
            </a>
          ))}
          {missingLinks.map((l) => (
            <span key={l.label} className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border/60 bg-transparent px-2.5 py-1.5 text-xs text-muted-foreground/70">
              {l.label} <span className="text-[10px] uppercase tracking-widest">Not provided</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function TabsBar({ tab, onTab, counts }: { tab: TabKey; onTab: (t: TabKey) => void; counts: { team: number; trust: number } }) {
  const items: { key: TabKey; label: string; badge?: number }[] = [
    { key: "overview", label: "Overview" },
    { key: "team", label: "Team", badge: counts.team },
    { key: "trust", label: "Trust", badge: counts.trust },
    { key: "memo", label: "Memo" },
    { key: "receipts", label: "Receipts" },
    { key: "decision", label: "Decision" },
  ];
  return (
    <div className="flex gap-1 border-b border-border bg-surface-1/40 px-4">
      {items.map((it) => (
        <button
          key={it.key}
          onClick={() => onTab(it.key)}
          className={cn(
            "relative flex items-center gap-1.5 px-3 py-3 text-xs font-medium transition-colors",
            tab === it.key ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {it.label}
          {it.badge != null && (
            <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10px]">{it.badge}</span>
          )}
          {tab === it.key && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-foreground" />}
        </button>
      ))}
    </div>
  );
}

/* ── Tabs ── */

function OverviewTab({ deal, thesisMatch }: { deal: Deal; thesisMatch: ThesisMatch | null }) {
  return (
    <div className="space-y-6">
      <AudioBriefing deal={deal} />
      {thesisMatch && <ThesisMatchPanel match={thesisMatch} />}
      <ThreeAxisScorecard deal={deal} />
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Pipeline">
          <KV rows={[
            ["Stage", deal.pipelineStage],
            ["Time in stage", `${deal.timeInStageHours}h`],
            ["Next action", deal.nextAction],
            ["Ask", `$${deal.askUsd.toLocaleString()}`],
            ...(deal.firstSignalAt ? [["First signal", new Date(deal.firstSignalAt).toLocaleString()] as [string, string]] : []),
            ...(deal.signalToDecisionHours != null ? [["Signal → decision", `${deal.signalToDecisionHours}h`] as [string, string]] : []),
          ]} />
        </SectionCard>
        <SectionCard title="Team coverage">
          <TeamCoverageGrid rows={deal.teamCoverage} />
        </SectionCard>
      </div>
    </div>
  );
}

function ThesisMatchPanel({ match }: { match: ThesisMatch }) {
  const positive = match.reasons.filter((r) => r.weight > 0);
  const negative = match.reasons.filter((r) => r.weight < 0);
  return (
    <SectionCard
      title="Thesis Match"
      subtitle="Rule-based thesis fit — sector, stage, geography, check size, ownership, risk gates. The three axes never enter this formula."
      right={
        <div className="inline-flex items-center gap-2 rounded-md border border-dashed border-info/40 bg-info/10 px-3 py-1.5 text-info">
          <Target className="h-3.5 w-3.5" />
          <span className="font-mono text-lg font-bold">{match.score}<span className="text-xs opacity-70">/100</span></span>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <ThesisReasonList label="In-thesis signals" items={positive} tone="success" />
        <ThesisReasonList label="Out-of-thesis penalties" items={negative} tone="danger" />
      </div>
    </SectionCard>
  );
}

function ThesisReasonList({ label, items, tone }: { label: string; items: ThesisMatch["reasons"]; tone: "success" | "danger" }) {
  const border = tone === "success" ? "border-success/30" : "border-danger/30";
  return (
    <div className={cn("rounded-lg border bg-surface-1 p-3", border)}>
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</div>
      {items.length === 0 ? (
        <div className="text-xs italic text-muted-foreground">None</div>
      ) : (
        <ul className="space-y-1 text-xs">
          {items.map((r, i) => (
            <li key={i} className="flex items-baseline justify-between gap-2">
              <span>{r.label}</span>
              <span className={cn("font-mono", r.weight > 0 ? "text-success" : "text-danger")}>{r.weight > 0 ? `+${r.weight}` : r.weight}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TeamTab({ deal, founders }: { deal: Deal; founders: Founder[] }) {
  const topIndividual = founders.length ? Math.max(...founders.map((f) => f.founderScore)) : null;
  return (
    <div className="space-y-6">
      <SectionCard title="Founder Axis — team in context of this opportunity"
        subtitle="Team-shaped score for THIS deal. Individual Founder Scores are inputs — never substitutes.">
        <div className="rounded-xl border border-border bg-surface-1 p-4">
          <div className="flex items-baseline gap-4">
            <div className="font-mono text-3xl font-bold">{deal.founderAxis.score}</div>
            <div className="text-xs text-muted-foreground">{deal.founderAxis.summary}</div>
          </div>
          {topIndividual != null && (
            <div className="mt-3 flex items-center justify-between rounded-md border border-border bg-surface-2 px-3 py-2 text-xs">
              <span className="text-muted-foreground">Top individual Founder Score — one input to this axis, never a substitute</span>
              <span className="font-mono font-bold">{topIndividual}</span>
            </div>
          )}
          <p className="mt-3 rounded-md border border-border bg-surface-2 p-2.5 text-[11px] text-muted-foreground">
            <Info className="mr-1 inline h-3 w-3" /> {deal.founderAxis.note}
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Team coverage — 7 areas" subtitle="Where the current team is strong, moderate, weak, missing, or unknown.">
        <TeamCoverageGrid rows={deal.teamCoverage} />
      </SectionCard>

      <SectionCard title={`Cofounders (${founders.length})`} subtitle="Each Founder Score is a long-term individual track record — separate from the deal.">
        <div className="grid gap-3 lg:grid-cols-2">
          {founders.length === 0 && (
            <div className="rounded-md border border-dashed border-border p-4 text-xs text-muted-foreground">No cofounders linked yet.</div>
          )}
          {founders.map((f) => <FounderMiniCard key={f.id} f={f} />)}
        </div>
      </SectionCard>
    </div>
  );
}

function FounderMiniCard({ f }: { f: Founder }) {
  const tone = f.founderScore >= 80 ? "text-success" : f.founderScore >= 60 ? "text-warning" : "text-danger";
  return (
    <Link to="/founders/$id" params={{ id: f.id }} className="block rounded-xl border border-border bg-surface-1 p-4 transition-colors hover:bg-surface-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold">{f.name} <span className="text-xs font-normal text-muted-foreground">· {f.role}</span></div>
          <div className="mt-0.5 text-xs text-muted-foreground">{f.location}</div>
        </div>
        <div className={cn("shrink-0 rounded-md border border-border bg-surface-2 px-2 py-1 text-center font-mono", tone)}>
          <div className="text-[9px] uppercase tracking-widest opacity-80">Founder Score</div>
          <div className="text-base font-bold leading-none">{f.founderScore}</div>
        </div>
      </div>
      <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{f.bio}</p>
      <div className="mt-2.5 flex flex-wrap gap-1">
        {f.expertise.slice(0, 3).map((e) => (
          <span key={e} className="rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted-foreground">{e}</span>
        ))}
        {f.contradictionCount > 0 && (
          <span className="rounded border border-danger/40 bg-danger/10 px-1.5 py-0.5 text-[10px] text-danger">{f.contradictionCount} contradiction{f.contradictionCount > 1 ? "s" : ""}</span>
        )}
      </div>
    </Link>
  );
}

function TeamCoverageGrid({ rows }: { rows: { area: string; rating: CoverageRating; note?: string }[] }) {
  const tone = (r: CoverageRating) =>
    r === "Strong" ? "text-success border-success/30 bg-success/10" :
    r === "Moderate" ? "text-warning border-warning/30 bg-warning/10" :
    r === "Weak" ? "text-danger/90 border-danger/30 bg-danger/5" :
    r === "Missing" ? "text-danger border-danger/40 bg-danger/10" :
    "text-muted-foreground border-border bg-surface-2";
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {rows.map((r) => (
        <div key={r.area} className={cn("flex items-center justify-between rounded-md border px-3 py-2", tone(r.rating))}>
          <div>
            <div className="text-xs font-medium">{r.area}</div>
            {r.note && <div className="text-[10px] opacity-80">{r.note}</div>}
          </div>
          <span className="rounded bg-black/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest">{r.rating}</span>
        </div>
      ))}
    </div>
  );
}

function ThreeAxisScorecard({ deal }: { deal: Deal }) {
  return (
    <SectionCard title="Three-Axis Scorecard" subtitle="Independent evaluations. Never combined into a single company score.">
      <div className="grid gap-3 lg:grid-cols-3">
        <AxisPanel title="Founder Axis (team)" score={`${deal.founderAxis.score}`} trend={deal.founderAxis.trend} tone="founder">
          <p className="text-xs text-muted-foreground">{deal.founderAxis.summary}</p>
        </AxisPanel>
        <AxisPanel title="Market Axis" score={deal.market.rating} trend={deal.market.trend} tone="market" rating={deal.market.rating}>
          <p className="text-xs text-muted-foreground">{deal.market.summary}</p>
          <div className="mt-2 text-xs"><span className="text-muted-foreground">TAM: </span>{deal.market.tam}</div>
          <div className="mt-2 flex flex-wrap gap-1">
            {deal.market.competitors.map((c) => (
              <span key={c} className="rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[10px]">{c}</span>
            ))}
          </div>
        </AxisPanel>
        <AxisPanel title="Idea vs. Market" score={`${deal.ideaVsMarket.score}`} trend={deal.ideaVsMarket.trend} tone="idea">
          <div className="rounded-md border border-border bg-surface-1 p-2 text-xs">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Verdict</div>
            <p className="mt-1">{deal.ideaVsMarket.verdict}</p>
          </div>
          <div className="mt-2 rounded-md border border-border bg-surface-1 p-2 text-xs">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Pivot flexibility</div>
            <p className="mt-1">{deal.ideaVsMarket.flexibility}</p>
          </div>
        </AxisPanel>
      </div>
    </SectionCard>
  );
}

function AxisPanel({ title, score, trend, tone, rating, children }: {
  title: string; score: string; trend: Trend; tone: "founder" | "market" | "idea"; rating?: MarketRating; children: React.ReactNode;
}) {
  const ratingTone = rating === "Bullish" ? "text-success" : rating === "Bear" ? "text-danger" : rating === "Neutral" ? "text-warning" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-surface-1 p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{title}</div>
          <div className={cn("mt-1 font-mono text-2xl font-bold", rating ? ratingTone : "text-foreground")}>{score}</div>
        </div>
        <div className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]",
          trend === "up" ? "border-success/40 bg-success/10 text-success"
          : trend === "down" ? "border-danger/40 bg-danger/10 text-danger"
          : "border-border bg-surface-2 text-muted-foreground")}>
          <TrendIcon t={trend} />{trend === "up" ? "Improving" : trend === "down" ? "Declining" : "Stable"}
        </div>
      </div>
      <div className="mt-3">{children}</div>
      <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-surface-3">
        <div className={cn("h-full rounded-full",
          tone === "founder" && "bg-foreground",
          tone === "market" && (rating === "Bullish" ? "bg-success" : rating === "Bear" ? "bg-danger" : "bg-warning"),
          tone === "idea" && "bg-info")}
          style={{ width: `${Math.min(100, parseInt(score) || (rating === "Bullish" ? 82 : rating === "Neutral" ? 60 : 40))}%` }} />
      </div>
    </div>
  );
}

/* Trust Tab */

function TrustTab({ deal, onOpenClaim }: { deal: Deal; onOpenClaim: (id: string) => void }) {
  return (
    <div className="space-y-6">
      <SectionCard
        title="Trust Score Radar — per-claim verification"
        subtitle="Every claim has a numeric Trust Score (0–100%) alongside its status. Click any claim for full evidence."
        right={
          <div className="flex items-center gap-3 text-[10px] uppercase tracking-widest text-muted-foreground">
            <LegendDot color="bg-success" label="Verified" />
            <LegendDot color="bg-muted-foreground" label="Unverified" />
            <LegendDot color="bg-danger" label="Contradicted" />
          </div>
        }
      >
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Trust</th>
                <th className="px-3 py-2 font-medium">Claim</th>
                <th className="px-3 py-2 font-medium">Detail / evidence</th>
                <th className="px-3 py-2 font-medium">Source</th>
                <th className="w-8 px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {deal.claims.map((c) => <ClaimRow key={c.id} c={c} onOpen={() => onOpenClaim(c.id)} />)}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

function ClaimRow({ c, onOpen }: { c: Claim; onOpen: () => void }) {
  const rowClass = c.status === "verified" ? "bg-success/5 hover:bg-success/10"
    : c.status === "contradicted" ? "pulse-danger hover:bg-danger/10"
    : "bg-surface-1 hover:bg-surface-2";
  const icon = c.status === "verified" ? <ShieldCheck className="h-3.5 w-3.5 text-success" />
    : c.status === "contradicted" ? <AlertTriangle className="h-3.5 w-3.5 text-danger" />
    : <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
  const label = c.status === "verified" ? "Verified" : c.status === "contradicted" ? "Alert" : "Unverified";
  const tone = c.trustScore >= 75 ? "text-success" : c.trustScore >= 50 ? "text-warning" : "text-danger";
  return (
    <tr className={cn("cursor-pointer transition-colors", rowClass)} onClick={onOpen}>
      <td className="whitespace-nowrap px-3 py-2 align-top">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium">{icon} {label}</span>
      </td>
      <td className="whitespace-nowrap px-3 py-2 align-top">
        <span className={cn("font-mono text-sm font-bold", tone)}>{c.trustScore}</span>
        <span className="text-[10px] text-muted-foreground">%</span>
      </td>
      <td className="px-3 py-2 align-top font-medium">{c.claim}</td>
      <td className="px-3 py-2 align-top text-muted-foreground">{c.detail}</td>
      <td className="whitespace-nowrap px-3 py-2 align-top font-mono text-[11px] text-muted-foreground">{c.source ?? "—"}</td>
      <td className="px-3 py-2 align-top text-muted-foreground"><ArrowRight className="h-3.5 w-3.5" /></td>
    </tr>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return <span className="inline-flex items-center gap-1"><span className={cn("h-1.5 w-1.5 rounded-full", color)} />{label}</span>;
}

/* Claim Evidence Sheet */

function ClaimSheet({ deal, claim, onClose }: { deal: Deal; claim?: Claim; onClose: () => void }) {
  return (
    <Sheet open={!!claim} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        {claim && (
          <>
            <SheetHeader>
              <SheetTitle className="pr-6 text-left">{claim.claim}</SheetTitle>
              <p className="text-left text-xs text-muted-foreground">{deal.company} · Claim {claim.id}</p>
            </SheetHeader>
            <div className="mt-5 space-y-4 text-sm">
              <div className={cn("rounded-lg border p-3",
                claim.status === "verified" ? "border-success/40 bg-success/5"
                : claim.status === "contradicted" ? "border-danger/40 bg-danger/5"
                : "border-border bg-surface-1")}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Trust Score</span>
                  <span className={cn("font-mono text-2xl font-bold",
                    claim.trustScore >= 75 ? "text-success" : claim.trustScore >= 50 ? "text-warning" : "text-danger")}>{claim.trustScore}<span className="text-xs text-muted-foreground">%</span></span>
                </div>
                <div className="mt-2 text-xs uppercase tracking-widest text-muted-foreground">Status: <span className="font-semibold text-foreground">{claim.status}</span></div>
              </div>

              <EvidenceBlock label="Detail">{claim.detail}</EvidenceBlock>
              {claim.sourceQuote && (
                <EvidenceBlock label="Source quote — the exact sentence this claim came from" tone="info">
                  <blockquote className="border-l-2 border-info/50 pl-2 italic">“{claim.sourceQuote}”</blockquote>
                </EvidenceBlock>
              )}
              {claim.conflictingEvidence && (
                <EvidenceBlock label={claim.artifact ? `Conflicting evidence — from ${claim.artifact}` : "Conflicting evidence"} tone="danger">{claim.conflictingEvidence}</EvidenceBlock>
              )}
              <EvidenceBlock label="AI explanation" tone="info">{claim.aiExplanation}</EvidenceBlock>

              <div className="grid grid-cols-2 gap-3">
                <MetaBox label="Source">{claim.source ?? "—"}</MetaBox>
                <MetaBox label="Collected">{claim.collectedAt}</MetaBox>
                <MetaBox label="Verified">{claim.verifiedAt ?? "—"}</MetaBox>
                <MetaBox label="Link">
                  {claim.sourceUrl
                    ? <a href={claim.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-info underline-offset-4 hover:underline">Open <ExternalLink className="h-3 w-3" /></a>
                    : <span className="text-muted-foreground">Not provided</span>}
                </MetaBox>
              </div>

              {claim.reviewNotes && claim.reviewNotes.length > 0 && (
                <EvidenceBlock label="Analyst notes">
                  <ul className="space-y-1">
                    {claim.reviewNotes.map((n, i) => <li key={i}>· {n}</li>)}
                  </ul>
                </EvidenceBlock>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function EvidenceBlock({ label, tone, children }: { label: string; tone?: "danger" | "info"; children: React.ReactNode }) {
  const cls = tone === "danger" ? "border-danger/30 bg-danger/5"
    : tone === "info" ? "border-info/30 bg-info/5" : "border-border bg-surface-1";
  return (
    <div className={cn("rounded-lg border p-3", cls)}>
      <div className="mb-1 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="text-xs leading-relaxed text-foreground/90">{children}</div>
    </div>
  );
}

function MetaBox({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-surface-1 p-2.5">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-xs">{children}</div>
    </div>
  );
}

/* Memo */

function MemoTab({ deal }: { deal: Deal }) {
  const qc = useQueryClient();
  const memoQ = useQuery({ queryKey: ["memo", deal.id], queryFn: () => api.getMemo(deal.id) });
  const [regenerating, setRegenerating] = useState(false);

  const memo = memoQ.data?.memo ?? deal.memo;
  const version = memoQ.data?.version ?? 1;
  const generatedAt = memoQ.data?.generatedAt;

  const regenerate = async () => {
    setRegenerating(true);
    try {
      const rec = await api.regenerateMemo(deal.id);
      qc.setQueryData(["memo", deal.id], rec);
      toast.success(`Memo regenerated (v${rec.version})`);
    } catch (e) { toast.error("Regenerate failed"); }
    finally { setRegenerating(false); }
  };

  return (
    <SectionCard
      title="AI-generated Investment Memo"
      subtitle="Structured, sourced, and updated on every artifact change."
      right={
        <div className="flex items-center gap-2">
          <span className="rounded border border-border bg-surface-2 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">v{version}</span>
          {generatedAt && <span className="hidden font-mono text-[10px] text-muted-foreground md:inline">{new Date(generatedAt).toLocaleString()}</span>}
          <Button size="sm" variant="outline" onClick={regenerate} disabled={regenerating}>
            {regenerating ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />} Regenerate
          </Button>
        </div>
      }
    >
      <article className="space-y-8 rounded-xl border border-border bg-surface-1 p-6 leading-relaxed">
        <MemoBlock heading="Company Snapshot"><p className="text-sm text-foreground/90">{memo.snapshot}</p></MemoBlock>

        <MemoBlock heading="Investment Hypotheses">
          <ul className="space-y-2 text-sm">
            {memo.hypotheses.map((h, i) => (
              <li key={i} className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground" /><span>{h}</span></li>
            ))}
          </ul>
        </MemoBlock>

        <MemoBlock heading="SWOT Analysis" hint="Derived from Trust Radar">
          <div className="grid gap-3 sm:grid-cols-2">
            <SwotBlock title="Strengths" items={memo.swot.strengths} tone="success" />
            <SwotBlock title="Weaknesses" items={memo.swot.weaknesses} tone="warning" />
            <SwotBlock title="Opportunities" items={memo.swot.opportunities} tone="info" />
            <SwotBlock title="Risks" items={memo.swot.risks} tone="danger" />
          </div>
        </MemoBlock>

        <MemoBlock heading="Problem & Product"><p className="text-sm text-foreground/90">{memo.problemProduct}</p></MemoBlock>

        <MemoBlock heading="Traction & KPIs">
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                {memo.traction.map((t) => {
                  const missing = /not disclosed|unavailable/i.test(t.value);
                  return (
                    <tr key={t.label} className="bg-surface-2">
                      <td className="w-1/2 px-3 py-2 text-muted-foreground">{t.label}</td>
                      <td className={cn("px-3 py-2 font-medium", missing && "italic text-muted-foreground")}>{t.value}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </MemoBlock>
      </article>
    </SectionCard>
  );
}

function MemoBlock({ heading, hint, children }: { heading: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between border-b border-border pb-2">
        <h3 className="text-base font-semibold tracking-tight">{heading}</h3>
        {hint && <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function SwotBlock({ title, items, tone }: { title: string; items: string[]; tone: "success" | "warning" | "info" | "danger" }) {
  const border = tone === "success" ? "border-success/30" : tone === "warning" ? "border-warning/30" : tone === "info" ? "border-info/30" : "border-danger/30";
  const text = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : tone === "info" ? "text-info" : "text-danger";
  return (
    <div className={cn("rounded-lg border bg-surface-2 p-3", border)}>
      <div className={cn("mb-2 text-[10px] font-semibold uppercase tracking-widest", text)}>{title}</div>
      <ul className="space-y-1.5 text-xs">
        {items.length === 0 ? <li className="italic text-muted-foreground">Pending</li> : items.map((i) => <li key={i} className="flex gap-1.5"><span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-foreground/50" /><span>{i}</span></li>)}
      </ul>
    </div>
  );
}

/* Receipts: agentic traceability — every step, every quote */

const STEP_LABELS: [RegExp, string][] = [
  [/^filter$/, "Viability screen"],
  [/^extraction$/, "Claim extraction (quote-anchored)"],
  [/^enrichment$/, "Public footprint enrichment"],
  [/^cold-start$/, "Cold-start footprint assessment"],
  [/^founder-score$/, "Founder Score update"],
  [/^feedback-context$/, "Investor feedback context"],
  [/^axis-founder$/, "Founder axis (team-in-context)"],
  [/^axis-market$/, "Market axis"],
  [/^axis-idea/, "Idea-vs-market axis"],
  [/^trust:/, "Claim verification"],
  [/^memo$/, "Investment memo"],
  [/^stage-change$/, "Stage change"],
  [/^decision$/, "Decision recorded"],
  [/^investor-feedback$/, "Feedback stored to thesis memory"],
  [/^outreach-send$/, "Outreach (simulated send)"],
];
const stepLabel = (s: string) => STEP_LABELS.find(([re]) => re.test(s))?.[1] ?? s;

function ReceiptsTab({ deal }: { deal: Deal }) {
  const traceQ = useQuery({ queryKey: ["trace", deal.id], queryFn: () => api.listTrace(deal.id) });
  const artifactsQ = useQuery({ queryKey: ["artifacts", deal.id], queryFn: () => api.listArtifacts(deal.id) });
  const trace = traceQ.data ?? [];
  const artifacts = artifactsQ.data ?? [];
  const quoted = deal.claims.filter((c) => c.sourceQuote);

  return (
    <div className="space-y-6">
      <SectionCard
        title="Pipeline receipts"
        subtitle="Every conclusion traces to a step. Every step traces to a source."
        right={<Receipt className="h-4 w-4 text-muted-foreground" />}
      >
        {traceQ.isLoading ? (
          <div className="rounded-md border border-border bg-surface-1 p-4 text-xs text-muted-foreground">Loading trace…</div>
        ) : traceQ.error ? (
          <div className="rounded-md border border-danger/40 bg-danger/5 p-4 text-xs text-danger">Trace unavailable — backend unreachable.</div>
        ) : trace.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-4 text-xs text-muted-foreground">
            No pipeline trace recorded for this deal yet.
          </div>
        ) : (
          <ol className="relative ml-2 space-y-0 border-l border-border">
            {trace.map((t, i) => (
              <li key={i} className="relative pb-4 pl-5">
                <span className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-info" />
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-xs font-medium">{stepLabel(t.step)}</span>
                  {t.model && <span className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">{t.model}</span>}
                  <span className="font-mono text-[9px] text-muted-foreground">{t.durationMs}ms</span>
                </div>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{t.summary}</p>
              </li>
            ))}
          </ol>
        )}
      </SectionCard>

      <SectionCard title={`Quote-anchored claims (${quoted.length}/${deal.claims.length})`}
        subtitle="No quote → no claim. Each claim carries the exact sentence it came from.">
        {quoted.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-4 text-xs text-muted-foreground">No quote-anchored claims on this deal.</div>
        ) : (
          <ul className="space-y-2">
            {quoted.map((c) => (
              <li key={c.id} className="rounded-md border border-border bg-surface-1 p-3">
                <div className="text-xs font-medium">{c.claim}</div>
                <blockquote className="mt-1.5 border-l-2 border-info/50 pl-2 text-[11px] italic text-muted-foreground">
                  “{c.sourceQuote}”
                </blockquote>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title={`Artifacts (${artifacts.length})`} subtitle="Submitted material the pipeline extracted from.">
        {artifacts.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-4 text-xs text-muted-foreground">No artifacts on file — nothing was fabricated to fill the gap.</div>
        ) : (
          <ul className="space-y-2">
            {artifacts.map((a) => (
              <li key={a.id} className="rounded-md border border-border bg-surface-1 p-3">
                <div className="flex items-center gap-2 text-xs font-medium">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" /> {a.label}
                  <span className="rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-muted-foreground">{a.kind}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{a.note}</p>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

/* Decision Tab: form + audit trail */

function DecisionTab({ deal, thesis }: { deal: Deal; thesis?: Thesis }) {
  const check = thesis?.checkSize ?? deal.askUsd;
  const decisionsQ = useQuery({ queryKey: ["decisions", deal.id], queryFn: () => api.listDecisions(deal.id) });
  const decisions = decisionsQ.data ?? [];

  return (
    <div className="space-y-6">
      <SectionCard title="Record a decision" subtitle="A note is required. Approvals are labeled 'Simulated investment decision'.">
        <DecisionForm deal={deal} check={check} />
      </SectionCard>
      <SectionCard title={`Audit trail (${decisions.length})`} subtitle="Every decision recorded here for this deal.">
        {decisions.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-4 text-xs text-muted-foreground">
            No decisions recorded yet.
          </div>
        ) : (
          <ul className="space-y-3">
            {decisions.map((d) => <AuditRow key={d.id} d={d} />)}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

const DECISION_OPTIONS: { kind: DecisionKind; label: string; tone: "success" | "warning" | "info" | "danger" }[] = [
  { kind: "approve", label: "Approve", tone: "success" },
  { kind: "approve_conditions", label: "Approve with Conditions", tone: "info" },
  { kind: "continue_diligence", label: "Continue Diligence", tone: "warning" },
  { kind: "decline", label: "Decline", tone: "danger" },
];

function DecisionForm({ deal, check }: { deal: Deal; check: number }) {
  const qc = useQueryClient();
  const [kind, setKind] = useState<DecisionKind>("continue_diligence");
  const [note, setNote] = useState("");
  const [conditions, setConditions] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lastRecord, setLastRecord] = useState<DecisionRecord | null>(null);
  const [feedbackStored, setFeedbackStored] = useState(false);

  const requiresConditions = kind === "approve_conditions";

  const submit = async () => {
    if (!note.trim()) { toast.error("A decision note is required"); return; }
    if (requiresConditions && !conditions.trim()) { toast.error("Conditions are required for 'Approve with Conditions'"); return; }
    setSubmitting(true);
    try {
      const rec = await api.decideDeal(deal.id, kind, { note: note.trim(), conditions: conditions.trim() || undefined });
      setLastRecord(rec);
      // Divergence from the pipeline's read → the backend stores thesis feedback.
      setFeedbackStored(kind === "decline" || (kind.startsWith("approve") && deal.alerts > 0));
      qc.invalidateQueries({ queryKey: ["decisions", deal.id] });
      qc.invalidateQueries({ queryKey: ["deals"] });
      qc.invalidateQueries({ queryKey: ["metrics"] });
      toast.success(kind === "continue_diligence"
        ? `${rec.analysisLabel} recorded`
        : `${rec.analysisLabel} recorded — deal moved to Decisions`);
      setNote(""); setConditions("");
    } catch { toast.error("Could not record decision"); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-4 rounded-xl border border-border bg-surface-1 p-4">
      <div>
        <div className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">Decision</div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {DECISION_OPTIONS.map((opt) => {
            const active = kind === opt.kind;
            const toneBorder = opt.tone === "success" ? "border-success/40" : opt.tone === "danger" ? "border-danger/40" : opt.tone === "info" ? "border-info/40" : "border-warning/40";
            const toneBg = active ? (opt.tone === "success" ? "bg-success/10 text-success" : opt.tone === "danger" ? "bg-danger/10 text-danger" : opt.tone === "info" ? "bg-info/10 text-info" : "bg-warning/10 text-warning") : "bg-surface-2 text-foreground/80 hover:bg-surface-3";
            return (
              <button key={opt.kind} type="button" onClick={() => setKind(opt.kind)}
                className={cn("rounded-md border px-3 py-2 text-xs font-medium transition-colors", toneBorder, toneBg)}>
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <div className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">Decision note <span className="text-danger">*</span></div>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why this decision? Reference specific claims, contradictions, or thesis fit."
          rows={3} className="bg-surface-2 text-sm" />
      </div>
      {requiresConditions && (
        <div>
          <div className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">Conditions <span className="text-danger">*</span></div>
          <Textarea value={conditions} onChange={(e) => setConditions(e.target.value)} placeholder="e.g. Verify BAA before wire; add technical cofounder within 60 days."
            rows={2} className="bg-surface-2 text-sm" />
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          {kind === "approve" || kind === "approve_conditions"
            ? <>Simulated ${check.toLocaleString()} check into <strong>{deal.company}</strong>. Labeled <em>Simulated investment decision</em>.</>
            : kind === "decline" ? <>Move {deal.company} to <strong>Declined</strong> pipeline stage.</>
            : <>Keep {deal.company} in <strong>Diligence</strong> with your open action items.</>}
        </p>
        <Button onClick={submit} disabled={submitting}>
          {submitting ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <CheckCircle2 className="mr-1 h-3 w-3" />}
          Record decision
        </Button>
      </div>
      {lastRecord && (
        <div className="rounded-lg border border-success/40 bg-success/5 p-3 text-xs">
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="h-3.5 w-3.5 text-success" /> Recorded: {lastRecord.analysisLabel}
            <span className="font-mono text-[10px] text-muted-foreground">{new Date(lastRecord.timestamp).toLocaleString()}</span>
          </div>
          <p className="mt-1 text-muted-foreground">{lastRecord.note}</p>
          {feedbackStored && (
            <p className="mt-2 rounded border border-info/40 bg-info/10 p-2 text-[11px] text-info">
              Feedback stored — future evaluations for this thesis will consider your reasoning.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function AuditRow({ d }: { d: DecisionRecord }) {
  const tone = d.kind === "approve" || d.kind === "approve_conditions" ? "success" : d.kind === "decline" ? "danger" : "warning";
  const border = tone === "success" ? "border-success/40" : tone === "danger" ? "border-danger/40" : "border-warning/40";
  const label = DECISION_OPTIONS.find((o) => o.kind === d.kind)?.label ?? d.kind;
  return (
    <li className={cn("rounded-lg border bg-surface-1 p-3", border)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          {label}
          <span className="rounded border border-info/40 bg-info/10 px-1.5 py-0.5 text-[10px] font-normal text-info">{d.analysisLabel}</span>
        </div>
        <span className="font-mono text-[11px] text-muted-foreground">{new Date(d.timestamp).toLocaleString()} · {d.actor}</span>
      </div>
      <p className="mt-2 text-xs text-foreground/90">{d.note}</p>
      {d.conditions && (
        <div className="mt-2 rounded border border-info/30 bg-info/5 p-2 text-[11px] text-foreground/90">
          <span className="text-[10px] uppercase tracking-widest text-info">Conditions</span>
          <p className="mt-1">{d.conditions}</p>
        </div>
      )}
    </li>
  );
}

/* Common */

function SectionCard({ title, subtitle, right, children }: { title: string; subtitle?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function KV({ rows }: { rows: [string, string][] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-sm">
        <tbody className="divide-y divide-border">
          {rows.map(([k, v]) => (
            <tr key={k} className="bg-surface-1">
              <td className="w-1/3 px-3 py-2 text-xs text-muted-foreground">{k}</td>
              <td className="px-3 py-2 text-xs">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const SPEEDS = [1, 1.25, 1.5, 2] as const;

function AudioBriefing({ deal }: { deal: Deal }) {
  const qc = useQueryClient();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Persistence: a previously generated briefing is fetched from the backend —
  // the player survives refresh and navigation without regenerating.
  const storedQ = useQuery({ queryKey: ["briefing", deal.id], queryFn: () => api.getBriefing(deal.id) });
  const briefing = storedQ.data ?? null;
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState<number>(1);

  useEffect(() => {
    setPlaying(false); setProgress(0); setError(null);
    audioRef.current?.pause();
  }, [deal.id]);

  const generate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const b = await api.generateBriefing(deal.id);
      qc.setQueryData(["briefing", deal.id], b);
      if (!b.url) setError("Audio unavailable (TTS degraded) — transcript generated server-side.");
      else toast.success("Briefing generated");
    } catch {
      setError("Could not generate briefing — backend unreachable or degraded.");
    } finally { setGenerating(false); }
  };

  const toggle = async () => {
    if (!briefing?.url) { await generate(); return; }
    const el = audioRef.current;
    if (!el) return;
    if (playing) { el.pause(); setPlaying(false); }
    else { el.playbackRate = speed; await el.play().catch(() => setError("Playback failed")); setPlaying(true); }
  };

  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed as (typeof SPEEDS)[number]) + 1) % SPEEDS.length];
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const dur = briefing?.durationSec ?? 0;

  return (
    <div className="rounded-xl border border-border bg-gradient-to-r from-surface-2 via-surface-1 to-surface-2 p-4">
      <div className="flex items-center gap-4">
        <button onClick={toggle} disabled={generating}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-foreground text-background transition-transform hover:scale-105 disabled:opacity-60">
          {generating ? <Loader2 className="h-5 w-5 animate-spin" /> : playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 translate-x-[1px]" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-info" /><p className="text-sm font-medium">AI Analyst Briefing</p></div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {generating ? "Generating script + audio server-side…"
              : storedQ.isLoading ? "Checking for an existing briefing…"
              : briefing ? <>Generated {new Date(briefing.generatedAt).toLocaleString()} · stored — survives refresh</>
              : <>Generate a spoken summary of the memo · {deal.company}</>}
          </p>
          {briefing?.url ? (
            <div className="mt-2 flex items-center gap-2">
              <input
                type="range" min={0} max={dur || 1} step={0.1} value={progress}
                onChange={(e) => { const v = parseFloat(e.target.value); setProgress(v); if (audioRef.current) audioRef.current.currentTime = v; }}
                className="h-1 flex-1 accent-foreground"
              />
              <span className="font-mono text-[10px] text-muted-foreground">{fmt(progress)} / {fmt(dur)}</span>
            </div>
          ) : error ? (
            <p className="mt-2 text-[11px] text-danger">{error}</p>
          ) : null}
        </div>
        <div className="hidden flex-col items-end gap-1 sm:flex">
          {briefing?.url && (
            <button onClick={cycleSpeed} className="rounded border border-border bg-surface-2 px-2 py-0.5 font-mono text-[10px] text-muted-foreground hover:text-foreground">
              {speed}×
            </button>
          )}
          <Button size="sm" variant="outline" onClick={generate} disabled={generating || storedQ.isLoading}>
            {generating ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
            {briefing ? "Regenerate" : "Generate briefing"}
          </Button>
        </div>
      </div>
      {briefing?.url && (
        <audio
          ref={audioRef} src={briefing.url} preload="metadata"
          onTimeUpdate={(e) => setProgress((e.target as HTMLAudioElement).currentTime)}
          onEnded={() => { setPlaying(false); setProgress(0); }}
          onError={() => setError("Audio failed to load")}
        />
      )}
    </div>
  );
}

/* Decision terminal (sticky) */

function DecisionTerminal({ deal, thesis, onOpenDecision }: { deal: Deal; thesis?: Thesis; onOpenDecision: () => void }) {
  const [remaining, setRemaining] = useState(() => Math.max(0, Math.floor((new Date(deal.decisionDeadline).getTime() - Date.now()) / 1000)));

  useEffect(() => {
    setRemaining(Math.max(0, Math.floor((new Date(deal.decisionDeadline).getTime() - Date.now()) / 1000)));
  }, [deal.id, deal.decisionDeadline]);

  useEffect(() => {
    const id = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(id);
  }, []);

  const hh = String(Math.floor(remaining / 3600)).padStart(2, "0");
  const mm = String(Math.floor((remaining % 3600) / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");
  const check = thesis?.checkSize ?? deal.askUsd;

  return (
    <div className="border-t border-border bg-background/95 px-6 py-4 backdrop-blur-xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button onClick={onOpenDecision} className="rounded-lg border border-border bg-surface-1 px-3 py-2 text-left hover:bg-surface-2">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">24-hour deployment window</div>
            <div className="mt-0.5 flex items-baseline gap-1 font-mono text-lg font-bold tabular-nums">
              <span>{hh}</span><span className="text-muted-foreground">:</span>
              <span>{mm}</span><span className="text-muted-foreground">:</span>
              <span>{ss}</span>
              <span className="ml-2 text-[10px] font-medium uppercase tracking-widest text-warning">Active</span>
            </div>
          </button>
          <div className="hidden text-xs text-muted-foreground sm:block">
            <div>Simulated <span className="font-mono font-semibold text-foreground">${check.toLocaleString()}</span> check into <span className="font-semibold text-foreground">{deal.company}</span></div>
            <div className="mt-0.5">A decision note is required — no one-click approve.</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="lg" onClick={onOpenDecision} className="bg-foreground text-background hover:bg-foreground/90">
            <ArrowRight className="mr-1.5 h-4 w-4" /> Open decision terminal
          </Button>
        </div>
      </div>
    </div>
  );
}
