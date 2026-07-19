// Unified async API surface for Scopos.
// USE_MOCKS=false → live fetch against the Scopos backend (contract-conformant).
// USE_MOCKS=true  → the in-memory demo store below (session-scoped, clearly synthetic).
// mocks.ts is imported for TYPES ONLY in live mode.
import {
  DEALS, FOUNDERS, SOURCING_FEED,
  type Deal, type Founder, type SourcingItem, type Claim, type ContactStatus,
  type PipelineStage,
} from "./mocks";

export const USE_MOCKS = false;

export const API_BASE_URL: string =
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_API_BASE_URL ??
  "http://127.0.0.1:8000";

const clone = <T,>(v: T): T =>
  typeof structuredClone === "function" ? structuredClone(v) : JSON.parse(JSON.stringify(v));
const wait = (ms = 100) => new Promise<void>((r) => setTimeout(r, ms));

/* ── Types beyond mocks ── */

export type ThesisRisk = "Conservative" | "Balanced" | "Aggressive";
export interface Thesis {
  id: string;
  name: string;
  sector: string;      // "All Sectors" allowed
  stage: string;       // "All Stages" allowed
  geography: string;   // "Global" allowed
  risk: ThesisRisk;
  checkSize: number;
  excludedSectors: string[];
  ownershipTargetPct: number;
  createdAt: string;
  active?: boolean;
}

export type RuleStatus = "match" | "mismatch" | "unknown";
export interface ThesisRule { label: string; status: RuleStatus; weight: number }
export interface ThesisMatch {
  score: number;                  // 0-100 — weighted RULE hits only; the three axes never enter this formula
  reasons: { label: string; weight: number }[];
  rules: ThesisRule[];
  coldStartBoost?: boolean;
}

export type DecisionKind = "approve" | "approve_conditions" | "continue_diligence" | "decline";
export interface DecisionRecord {
  id: string;
  dealId: string;
  kind: DecisionKind;
  note: string;
  conditions?: string;
  timestamp: string;
  analysisLabel: string;
  actor: string;
}

export interface Artifact { id: string; label: string; kind: "deck" | "cv" | "video"; note: string }

export interface Briefing {
  url: string | null;
  durationSec: number;
  generatedAt: string;
  transcript?: string;
  chapters?: { title: string; startSec: number }[];
}

export interface TraceItem { step: string; model: string; summary: string; durationMs: number; createdAt: string }

export interface Metrics {
  pendingCount: number;
  decidedCount: number;
  medianSignalToDecisionHours: number | null;
  contradictionsCaught: number;
  coldStartCount: number;
  realSourcedCount: number;
}

export interface FeedbackNote { dealId?: string | null; decision?: string | null; note?: string | null; at?: string | null }

/* ── Outreach ── */
export type OutreachStatus = "not_sent" | "sent";
export interface OutreachState {
  status: OutreachStatus;
  sentAt?: string | null;
  channel?: "Email" | "LinkedIn" | "Twitter" | null;
  draftReady?: boolean;
  simulated?: boolean; // sends never leave the system
}
export interface OutreachDraft {
  subject: string;
  body: string;
  signals: { label: string; detail: string; points?: number | null }[];
  signalStrength: number;
}

export interface IngestResult {
  signals: SourcingItem[];
  founders: Founder[];
  deals?: Deal[];
  skipped?: number;
  errors?: string[];
}

export interface NLCriteria {
  sector?: string | null;
  stage?: string | null;
  geography?: string | null;
  minFounderScore?: number | null;
  coldStart?: boolean | null;
  verifiedOnly?: boolean | null;
  hasContradictions?: boolean | null;
  keyword?: string | null;
  raw: string;
}
export interface NLSearchResult {
  criteria: NLCriteria;
  deals: { deal: Deal; match: number; why: string[]; missing?: string[] }[];
  founders: { founder: Founder; match: number; why: string[] }[];
}

export interface ApplicationPayload {
  company: string;
  tagline?: string;
  sector?: string;
  stage?: string;
  geography?: string;
  founders: { name: string; role: string; email: string; linkedin?: string; github?: string }[];
  links: string[];
  hasDeck: boolean;
  askUsd?: number | null;
  deckFile?: string | null;   // base64 PDF — extracted server-side
  cvFile?: string | null;     // base64 PDF
  cvText?: string | null;
  videoPitch?: string | null;
}
export interface ApplicationResult { dealId: string; matchedFounderIds: string[]; newFounderIds: string[] }

/** Outreach Pipeline = outbound-sourced deals whose deck hasn't arrived yet. */
export function isOutreachDeal(deal: Deal): boolean {
  return deal.pipelineStage === "Sourced" || deal.pipelineStage === "Invited";
}

/** High Upside · High Risk — explicit axis-disagreement rule (documented in FEATURES.md):
 * strong idea signal (Idea-vs-Market ≥ 65) with an unproven team (Founder Axis < 50). */
export function isHighUpside(deal: Deal): boolean {
  return deal.ideaVsMarket.score >= 65 && deal.founderAxis.score < 50;
}
export const HIGH_UPSIDE_TOOLTIP =
  "Strong idea signal, unproven team — the axis disagreement worth a look. " +
  "Rule: Idea-vs-Market ≥ 65 and Founder Axis < 50.";

/** Signal Strength for outreach-card SORTING — mirrors the backend's transparent
 * breakdown formula. Display values come from the backend draft when live. */
export function computeSignalStrength(deal: Deal, foundersById?: Map<string, Founder>): number {
  let teamMax = deal.founderAxis.score;
  if (foundersById && deal.founderIds.length) {
    const scores = deal.founderIds
      .map((id) => foundersById.get(id)?.founderScore)
      .filter((s): s is number => typeof s === "number");
    if (scores.length) teamMax = Math.max(...scores);
  }
  const verified = deal.claims.filter((c) => c.status === "verified").length;
  const market = deal.market.rating === "Bullish" ? 82 : deal.market.rating === "Neutral" ? 60 : 40;
  const trend = deal.ideaVsMarket.trend === "up" ? 6 : deal.ideaVsMarket.trend === "down" ? -4 : 0;
  const raw = teamMax * 0.45 + market * 0.20 + verified * 6 + trend + 18;
  return Math.max(10, Math.min(100, Math.round(raw)));
}

/* ── Thesis match: RULE GATES ONLY.
   The three axes (Founder / Market / Idea-vs-Market) NEVER enter this formula —
   it is a pure thesis-fit filter built from investable-criteria rules. ── */

const RULE_WEIGHTS = {
  sector: 25, stage: 15, geography: 10, checkSize: 15,
  ownership: 10, excluded: 10, riskGate: 15,
} as const;

export function scoreThesisMatch(deal: Deal, t: Thesis): ThesisMatch {
  if (t.excludedSectors.includes(deal.sector)) {
    const rules: ThesisRule[] = [{ label: `Sector "${deal.sector}" is excluded by thesis`, status: "mismatch", weight: 0 }];
    return { score: 0, rules, reasons: [{ label: `Sector "${deal.sector}" is excluded by thesis`, weight: -100 }] };
  }
  const rules: ThesisRule[] = [];
  const rule = (label: string, status: RuleStatus, w: number) => rules.push({ label, status, weight: status === "match" ? w : 0 });

  rule(t.sector === "All Sectors" || deal.sector === t.sector
    ? `Sector ${deal.sector} in thesis` : `Off-sector (${deal.sector} vs ${t.sector})`,
    t.sector === "All Sectors" || deal.sector === t.sector ? "match" : "mismatch", RULE_WEIGHTS.sector);
  rule(t.stage === "All Stages" || deal.stage === t.stage
    ? `Stage ${deal.stage} in thesis` : `Stage ${deal.stage} outside ${t.stage}`,
    t.stage === "All Stages" || deal.stage === t.stage ? "match" : "mismatch", RULE_WEIGHTS.stage);
  rule(t.geography === "Global" || deal.geography === t.geography
    ? `Geography ${deal.geography} in scope` : `Geography ${deal.geography} out of scope`,
    t.geography === "Global" || deal.geography === t.geography ? "match" : "mismatch", RULE_WEIGHTS.geography);

  if (deal.askUsd > 0) {
    const fits = deal.askUsd >= t.checkSize;
    rule(fits ? `Ask $${(deal.askUsd / 1000).toFixed(0)}K absorbs $${(t.checkSize / 1000).toFixed(0)}K check`
      : `Ask $${(deal.askUsd / 1000).toFixed(0)}K below $${(t.checkSize / 1000).toFixed(0)}K check`,
      fits ? "match" : "mismatch", RULE_WEIGHTS.checkSize);
  } else {
    rule("Funding ask not disclosed", "unknown", RULE_WEIGHTS.checkSize);
  }

  // Ownership: the target is defined on the thesis; without a disclosed valuation
  // the fit is honestly Unknown — flagged, never fabricated.
  rule(`Ownership target ${t.ownershipTargetPct}% — valuation not disclosed`, "unknown", RULE_WEIGHTS.ownership);

  rule("Not in an excluded sector", "match", RULE_WEIGHTS.excluded);

  if (t.risk === "Conservative") {
    rule(deal.alerts === 0 ? "Risk gate (Conservative): zero contradicted claims"
      : `Risk gate (Conservative) failed: ${deal.alerts} contradiction(s)`,
      deal.alerts === 0 ? "match" : "mismatch", RULE_WEIGHTS.riskGate);
  } else if (t.risk === "Balanced") {
    rule(deal.alerts <= 1 ? "Risk gate (Balanced): ≤1 open contradiction"
      : `Risk gate (Balanced) failed: ${deal.alerts} contradictions`,
      deal.alerts <= 1 ? "match" : "mismatch", RULE_WEIGHTS.riskGate);
  } else {
    rule("Risk gate (Aggressive): no contradiction gate", "match", RULE_WEIGHTS.riskGate);
  }

  let coldStartBoost = false;
  if (deal.isColdStart && t.risk === "Aggressive") {
    coldStartBoost = true;
    rules.push({ label: "Cold-start founder welcomed under Aggressive risk", status: "match", weight: 5 });
  }

  const score = Math.max(0, Math.min(100, rules.reduce((s, r) => s + r.weight, 0)));
  // display weights: match → +w, mismatch → −(missed weight), unknown → 0
  const order = [RULE_WEIGHTS.sector, RULE_WEIGHTS.stage, RULE_WEIGHTS.geography,
    RULE_WEIGHTS.checkSize, RULE_WEIGHTS.ownership, RULE_WEIGHTS.excluded, RULE_WEIGHTS.riskGate];
  const reasons = rules.map((r, i) => ({
    label: r.status === "unknown" ? `${r.label} (Unknown)` : r.label,
    weight: r.status === "match" ? r.weight : r.status === "mismatch" ? -(order[i] ?? 10) : 0,
  }));
  return { score, rules, reasons, coldStartBoost };
}

/* ────────────────── LIVE IMPLEMENTATION ────────────────── */

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch (e) {
    throw new ApiError(0, `Backend unreachable at ${API_BASE_URL} — is it running? (${String(e)})`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ApiError(res.status, `${res.status} ${res.statusText}: ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

const post = <T,>(path: string, body?: unknown): Promise<T> =>
  request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

async function maybe<T>(p: Promise<T>): Promise<T | undefined> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return undefined;
    throw e; // callers render their existing error states
  }
}

const liveApi = {
  /* Deals */
  async listDeals(status: "pending" | "decided" | "all" = "pending"): Promise<Deal[]> {
    return request<Deal[]>(`/deals?status=${status}`);
  },
  async getDeal(id: string): Promise<Deal | undefined> {
    return maybe(request<Deal>(`/deals/${id}`));
  },
  async starDeal(id: string, starred: boolean): Promise<void> {
    await post(`/deals/${id}/star`, { starred });
  },
  async setDealStage(id: string, stage: PipelineStage, nextAction?: string): Promise<void> {
    await post(`/deals/${id}/stage`, { stage, nextAction });
  },
  async decideDeal(id: string, decision: DecisionKind, opts: { note: string; conditions?: string; actor?: string }): Promise<DecisionRecord> {
    return post<DecisionRecord>(`/deals/${id}/decide`, { decision, ...opts });
  },
  async listDecisions(dealId: string): Promise<DecisionRecord[]> {
    return request<DecisionRecord[]>(`/deals/${dealId}/decisions`);
  },

  /* Founders */
  async listFounders(): Promise<Founder[]> {
    return request<Founder[]>("/founders");
  },
  async getFounder(id: string): Promise<Founder | undefined> {
    return maybe(request<Founder>(`/founders/${id}`));
  },
  async setFounderContactStatus(id: string, status: ContactStatus): Promise<void> {
    await post(`/founders/${id}/contact-status`, { status });
  },

  /* Sourcing */
  async listSourcing(): Promise<SourcingItem[]> {
    return request<SourcingItem[]>("/sourcing");
  },

  /* Claims */
  async getClaim(dealId: string, claimId: string): Promise<Claim | undefined> {
    return maybe(request<Claim>(`/deals/${dealId}/claims/${claimId}`));
  },
  async addClaimNote(dealId: string, claimId: string, note: string): Promise<void> {
    await post(`/deals/${dealId}/claims/${claimId}/notes`, { note });
  },

  /* Memo (envelope) */
  async getMemo(dealId: string): Promise<{ memo: Deal["memo"]; generatedAt: string; version: number } | undefined> {
    return maybe(request<{ memo: Deal["memo"]; generatedAt: string; version: number }>(`/deals/${dealId}/memo`));
  },
  async regenerateMemo(dealId: string): Promise<{ memo: Deal["memo"]; generatedAt: string; version: number }> {
    return post(`/deals/${dealId}/memo/regenerate`);
  },

  /* Audio briefing — real mp3, absolute url; persisted server-side */
  async getBriefing(dealId: string): Promise<Briefing | undefined> {
    return maybe(request<Briefing>(`/deals/${dealId}/briefing`));
  },
  async generateBriefing(dealId: string): Promise<Briefing> {
    return post<Briefing>(`/deals/${dealId}/briefing`);
  },

  /* DEMO convergence: constructs an application from a lead's real public
   * footprint and runs the full inbound pipeline — clearly labeled simulated. */
  async simulateApplication(dealId: string): Promise<Deal> {
    return post<Deal>(`/deals/${dealId}/simulate-application`);
  },

  /* Theses */
  async listTheses(): Promise<Thesis[]> {
    return request<Thesis[]>("/theses");
  },
  async getActiveThesis(): Promise<Thesis> {
    return request<Thesis>("/theses/active");
  },
  async saveThesis(t: Omit<Thesis, "id" | "createdAt"> & { id?: string }): Promise<Thesis> {
    return post<Thesis>("/theses", t);
  },
  async setActiveThesis(id: string): Promise<void> {
    await post(`/theses/${id}/activate`);
  },
  async getThesisFeedback(thesisId: string): Promise<FeedbackNote[]> {
    return request<FeedbackNote[]>(`/theses/${thesisId}/feedback`);
  },

  /* Ingestion — renders exactly what the backend created */
  async ingestHackerNews(): Promise<IngestResult> {
    return post<IngestResult>("/ingest/hn?limit=2");
  },
  async ingestGitHub(): Promise<IngestResult> {
    return post<IngestResult>("/ingest/github?limit=2");
  },

  /* Natural language search */
  async searchNaturalLanguage(query: string): Promise<NLSearchResult> {
    return post<NLSearchResult>("/search", { query });
  },

  /* Artifacts + receipts */
  async listArtifacts(dealId: string): Promise<Artifact[]> {
    return request<Artifact[]>(`/deals/${dealId}/artifacts`);
  },
  async listTrace(dealId: string): Promise<TraceItem[]> {
    return request<TraceItem[]>(`/deals/${dealId}/trace`);
  },

  /* Outreach — drafts + SIMULATED sends only */
  async getOutreachState(dealId: string): Promise<OutreachState> {
    return request<OutreachState>(`/deals/${dealId}/outreach/state`);
  },
  async getOutreachDraft(dealId: string): Promise<OutreachDraft | undefined> {
    return maybe(request<OutreachDraft>(`/deals/${dealId}/outreach/draft`));
  },
  async sendOutreach(dealId: string, opts?: { channel?: OutreachState["channel"]; subject?: string; body?: string }): Promise<OutreachState> {
    return post<OutreachState>(`/deals/${dealId}/outreach/send`, opts ?? {});
  },

  /* Metrics */
  async getMetrics(): Promise<Metrics> {
    return request<Metrics>("/metrics/summary");
  },

  /* Application intake */
  async submitApplication(payload: ApplicationPayload): Promise<ApplicationResult> {
    return post<ApplicationResult>("/applications", payload);
  },
};

export type VCApi = typeof liveApi;

/* ────────────────── MOCK IMPLEMENTATION (USE_MOCKS=true) ────────────────── */

let deals: Deal[] = clone(DEALS);
let founders: Founder[] = clone(FOUNDERS);
let feed: SourcingItem[] = clone(SOURCING_FEED);
const memoCache = new Map<string, { snapshot: Deal["memo"]; generatedAt: string; version: number }>();
const artifactsByDeal = new Map<string, Artifact[]>();
const decisionsByDeal = new Map<string, DecisionRecord[]>();
const outreachStateByDeal = new Map<string, OutreachState>();

let theses: Thesis[] = [
  {
    id: "t-default", name: "Default — AI Infra Seed / US-EU / Balanced",
    sector: "AI Infra", stage: "Seed", geography: "Global",
    risk: "Balanced", checkSize: 100000, excludedSectors: [], ownershipTargetPct: 10,
    createdAt: new Date().toISOString(), active: true,
  },
  {
    id: "t-devtools", name: "Devtools Pre-Seed — Aggressive",
    sector: "DevTools", stage: "Pre-Seed", geography: "Global",
    risk: "Aggressive", checkSize: 100000, excludedSectors: ["B2B SaaS"], ownershipTargetPct: 12,
    createdAt: new Date().toISOString(),
  },
];
let activeThesisId = "t-default";

const mockApi: VCApi = {
  async listDeals(status: "pending" | "decided" | "all" = "pending") {
    await wait();
    const all = clone(deals);
    if (status === "all") return all;
    const decided = (d: Deal) => d.pipelineStage === "Approved" || d.pipelineStage === "Declined";
    return all.filter((d) => (status === "decided" ? decided(d) : !decided(d)));
  },
  async getDeal(id) { await wait(); return clone(deals.find((d) => d.id === id)); },
  async starDeal(id, starred) {
    await wait(40);
    deals = deals.map((d) => (d.id === id ? { ...d, starred } : d));
  },
  async setDealStage(id, stage, nextAction) {
    await wait(40);
    deals = deals.map((d) => (d.id === id ? { ...d, pipelineStage: stage, nextAction: nextAction ?? d.nextAction, timeInStageHours: 0 } : d));
  },
  async decideDeal(id, decision, opts) {
    await wait(80);
    const stage: PipelineStage =
      decision === "approve" || decision === "approve_conditions" ? "Approved"
      : decision === "decline" ? "Declined" : "Diligence";
    deals = deals.map((d) => (d.id === id ? { ...d, pipelineStage: stage, decidedAt: new Date().toISOString() } : d));
    const rec: DecisionRecord = {
      id: `dec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      dealId: id, kind: decision, note: opts.note, conditions: opts.conditions,
      timestamp: new Date().toISOString(),
      analysisLabel: decision === "approve" || decision === "approve_conditions"
        ? "Simulated investment decision" : decision === "decline" ? "Simulated decline" : "Continued diligence",
      actor: opts.actor ?? "Analyst",
    };
    decisionsByDeal.set(id, [rec, ...(decisionsByDeal.get(id) ?? [])]);
    return clone(rec);
  },
  async listDecisions(dealId) { await wait(30); return clone(decisionsByDeal.get(dealId) ?? []); },

  async listFounders() { await wait(); return clone(founders); },
  async getFounder(id) { await wait(); return clone(founders.find((f) => f.id === id)); },
  async setFounderContactStatus(id, status) {
    await wait(40);
    founders = founders.map((f) => (f.id === id ? { ...f, contactStatus: status } : f));
  },

  async listSourcing() { await wait(); return clone(feed); },

  async getClaim(dealId, claimId) {
    await wait(40);
    return clone(deals.find((d) => d.id === dealId)?.claims.find((c) => c.id === claimId));
  },
  async addClaimNote(dealId, claimId, note) {
    await wait(40);
    deals = deals.map((d) =>
      d.id !== dealId ? d :
      { ...d, claims: d.claims.map((c) => c.id !== claimId ? c : { ...c, reviewNotes: [...(c.reviewNotes ?? []), note] }) });
  },

  async getMemo(dealId) {
    await wait(60);
    const deal = deals.find((d) => d.id === dealId);
    if (!deal) return undefined;
    const cached = memoCache.get(dealId) ?? { snapshot: deal.memo, generatedAt: new Date().toISOString(), version: 1 };
    memoCache.set(dealId, cached);
    return clone({ memo: cached.snapshot, generatedAt: cached.generatedAt, version: cached.version });
  },
  async regenerateMemo(dealId) {
    await wait(500);
    const deal = deals.find((d) => d.id === dealId);
    if (!deal) throw new Error("Deal not found");
    const version = (memoCache.get(dealId)?.version ?? 1) + 1;
    const rec = { snapshot: deal.memo, generatedAt: new Date().toISOString(), version };
    memoCache.set(dealId, rec);
    return clone({ memo: rec.snapshot, generatedAt: rec.generatedAt, version: rec.version });
  },

  async getBriefing() { await wait(30); return undefined; },
  async generateBriefing(dealId) {
    await wait(700);
    return { url: null, durationSec: 0, generatedAt: new Date().toISOString(), transcript: `Mock mode — no audio generated for ${dealId}.`, chapters: [] };
  },
  async simulateApplication(): Promise<Deal> {
    await wait(100);
    throw new Error("Simulated application requires the live backend");
  },

  async listTheses() { await wait(30); return clone(theses.map((t) => ({ ...t, active: t.id === activeThesisId }))); },
  async getActiveThesis() {
    await wait(10);
    return clone(theses.find((t) => t.id === activeThesisId) ?? theses[0]);
  },
  async saveThesis(t) {
    await wait(40);
    const idx = t.id ? theses.findIndex((x) => x.id === t.id) : -1;
    if (idx >= 0) {
      const merged: Thesis = { ...theses[idx], ...t, id: theses[idx].id, createdAt: theses[idx].createdAt };
      theses = theses.map((x, i) => (i === idx ? merged : x));
      return clone(merged);
    }
    const created: Thesis = { ...t, id: `t-${Date.now()}`, createdAt: new Date().toISOString() };
    theses = [created, ...theses];
    return clone(created);
  },
  async setActiveThesis(id) {
    await wait(20);
    if (theses.find((t) => t.id === id)) activeThesisId = id;
  },
  async getThesisFeedback() { await wait(20); return []; },

  async ingestHackerNews() {
    await wait(400);
    const sig: SourcingItem = { id: `hn-${Date.now()}`, time: "now", source: "Show HN", text: "Mock scan — enable the live backend for real ingestion." };
    feed = [sig, ...feed];
    return { signals: [clone(sig)], founders: [], deals: [] };
  },
  async ingestGitHub() {
    await wait(400);
    const sig: SourcingItem = { id: `gh-${Date.now()}`, time: "now", source: "GitHub", text: "Mock scan — enable the live backend for real ingestion." };
    feed = [sig, ...feed];
    return { signals: [clone(sig)], founders: [], deals: [] };
  },

  async searchNaturalLanguage(query) {
    await wait(60);
    const q = query.toLowerCase();
    const matchedDeals = deals
      .filter((d) => `${d.company} ${d.tagline} ${d.sector}`.toLowerCase().includes(q.split(" ")[0] ?? ""))
      .slice(0, 12)
      .map((d) => ({ deal: clone(d), match: 60, why: ["Keyword match"] }));
    return { criteria: { raw: query, keyword: q.split(" ")[0] }, deals: matchedDeals, founders: [] };
  },

  async listArtifacts(dealId) { await wait(20); return clone(artifactsByDeal.get(dealId) ?? []); },
  async listTrace() { await wait(20); return []; },

  async getOutreachState(dealId) {
    await wait(20);
    return clone(outreachStateByDeal.get(dealId) ?? { status: "not_sent" as const, draftReady: true, simulated: true });
  },
  async getOutreachDraft(dealId) {
    await wait(80);
    const deal = deals.find((d) => d.id === dealId);
    if (!deal) return undefined;
    return {
      subject: `Quick note on ${deal.company} — from an early-stage fund`,
      body: `Hi there,\n\nWe came across ${deal.company} — ${deal.tagline}\n\nWe'd love a 20-minute intro.\n\n— Scopos (mock draft)`,
      signals: [{ label: deal.source, detail: `${deal.sector} · ${deal.geography}` }],
      signalStrength: computeSignalStrength(deal),
    };
  },
  async sendOutreach(dealId, opts) {
    await wait(200);
    const state: OutreachState = { status: "sent", sentAt: new Date().toISOString(), channel: opts?.channel ?? "Email", draftReady: true, simulated: true };
    outreachStateByDeal.set(dealId, state);
    deals = deals.map((d) =>
      d.id !== dealId ? d :
      d.pipelineStage === "Sourced"
        ? { ...d, pipelineStage: "Invited", nextAction: "Awaiting response — pitch deck not yet received.", timeInStageHours: 0 }
        : d);
    return clone(state);
  },

  async getMetrics() {
    await wait(30);
    const decided = deals.filter((d) => d.pipelineStage === "Approved" || d.pipelineStage === "Declined");
    return {
      pendingCount: deals.length - decided.length,
      decidedCount: decided.length,
      medianSignalToDecisionHours: null,
      contradictionsCaught: deals.reduce((s, d) => s + d.alerts, 0),
      coldStartCount: deals.filter((d) => d.isColdStart).length,
      realSourcedCount: 0,
    };
  },

  async submitApplication(payload) {
    await wait(200);
    const matched: string[] = [];
    for (const f of payload.founders) {
      const existing = founders.find((x) => x.email.toLowerCase() === f.email.toLowerCase());
      if (existing) matched.push(existing.id);
    }
    return { dealId: `sub-${Date.now()}`, matchedFounderIds: matched, newFounderIds: [] };
  },
};

/** Legacy mock-store subscription hook — a no-op in live mode, where React
 * Query invalidations drive refreshes. Kept so layout code works in both modes. */
export function subscribeApi(cb: () => void): () => void {
  void cb;
  return () => {};
}

export const api: VCApi = USE_MOCKS ? mockApi : liveApi;

export type { Deal, Founder, Claim, SourcingItem } from "./mocks";
