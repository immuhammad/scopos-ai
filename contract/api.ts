// Unified async API surface. Backed by mock data for now (USE_MOCKS = true).
// Flip USE_MOCKS to false and the same signatures can be wired to real endpoints.
import { DEALS, FOUNDERS, SOURCING_FEED, type Deal, type Founder, type SourcingItem, type Claim, type ContactStatus } from "./mocks";

export const USE_MOCKS = true;

const clone = <T,>(v: T): T => (typeof structuredClone === "function" ? structuredClone(v) : JSON.parse(JSON.stringify(v)));
const wait = (ms = 120) => new Promise<void>((r) => setTimeout(r, ms));

// In-memory mutable store (session-scoped)
let deals: Deal[] = clone(DEALS);
let founders: Founder[] = clone(FOUNDERS);
const feed: SourcingItem[] = clone(SOURCING_FEED);

export const api = {
  // Deals
  async listDeals(): Promise<Deal[]> { await wait(); return clone(deals); },
  async getDeal(id: string): Promise<Deal | undefined> { await wait(); return clone(deals.find((d) => d.id === id)); },
  async starDeal(id: string, starred: boolean): Promise<void> {
    await wait(60);
    deals = deals.map((d) => (d.id === id ? { ...d, starred } : d));
  },
  async decideDeal(id: string, decision: "approve" | "decline", note?: string): Promise<Deal | undefined> {
    await wait();
    deals = deals.map((d) =>
      d.id === id
        ? { ...d, pipelineStage: decision === "approve" ? "Approved" : "Declined", nextAction: note || d.nextAction }
        : d,
    );
    return clone(deals.find((d) => d.id === id));
  },

  // Founders (project-independent memory)
  async listFounders(): Promise<Founder[]> { await wait(); return clone(founders); },
  async getFounder(id: string): Promise<Founder | undefined> { await wait(); return clone(founders.find((f) => f.id === id)); },
  async setFounderContactStatus(id: string, status: ContactStatus): Promise<void> {
    await wait(60);
    founders = founders.map((f) => (f.id === id ? { ...f, contactStatus: status } : f));
  },

  // Sourcing feed
  async listSourcing(): Promise<SourcingItem[]> { await wait(); return clone(feed); },

  // Claims (evidence panel)
  async getClaim(dealId: string, claimId: string): Promise<Claim | undefined> {
    await wait(60);
    return clone(deals.find((d) => d.id === dealId)?.claims.find((c) => c.id === claimId));
  },
  async addClaimNote(dealId: string, claimId: string, note: string): Promise<void> {
    await wait(60);
    deals = deals.map((d) =>
      d.id !== dealId
        ? d
        : { ...d, claims: d.claims.map((c) => (c.id !== claimId ? c : { ...c, reviewNotes: [...(c.reviewNotes ?? []), note] })) },
    );
  },

  // Application intake (Apply page)
  async submitApplication(payload: {
    company: string;
    tagline?: string;
    sector?: string;
    stage?: string;
    geography?: string;
    founders: { name: string; role: string; email: string; linkedin?: string; github?: string }[];
    links: string[];
    hasDeck: boolean;
  }): Promise<{ dealId: string; matchedFounderIds: string[] }> {
    await wait(220);
    // Dedup founders by email against founder memory
    const matched: string[] = [];
    for (const f of payload.founders) {
      const existing = founders.find((x) => x.email.toLowerCase() === f.email.toLowerCase());
      if (existing) matched.push(existing.id);
    }
    return { dealId: `sub-${Date.now()}`, matchedFounderIds: matched };
  },
};

export type { Deal, Founder, Claim, SourcingItem } from "./mocks";
