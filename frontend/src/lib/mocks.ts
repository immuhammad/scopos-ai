// Demo/mock data. Clearly synthetic — the UI labels it.
export type Trend = "up" | "flat" | "down";
export type MarketRating = "Bullish" | "Neutral" | "Bear";
export type ClaimStatus = "verified" | "unverified" | "contradicted";
export type ContactStatus =
  | "Discovered" | "Reviewing" | "Contacted" | "Invited to Apply"
  | "Applied" | "In Diligence" | "Funded" | "Passed";
export type PipelineStage =
  | "Sourced" | "Invited" | "Application Received"
  | "Screening" | "Diligence" | "Decision Ready" | "Approved" | "Declined";
export type CoverageRating = "Strong" | "Moderate" | "Weak" | "Missing" | "Unknown";
export type SourceType =
  | "Inbound Application" | "Outbound Discovery via GitHub"
  | "Outbound — Show HN" | "Cold-Start Founder" | "Inbound — Referral";

export interface Claim {
  id: string;
  claim: string;
  status: ClaimStatus;
  trustScore: number;
  detail: string;
  source?: string;
  sourceUrl?: string | null;
  collectedAt: string;
  verifiedAt?: string;
  conflictingEvidence?: string;
  aiExplanation: string;
  reviewNotes?: string[];
  sourceQuote?: string | null;  // exact sentence the claim was extracted from (quote-anchored)
  artifact?: string | null;     // which artifact the conflicting quote came from
}

export interface FounderComponent { label: string; points: number }
export interface FounderEvent { date: string; event: string; source: string; delta: number }

export interface Founder {
  id: string;
  name: string;
  role: "CEO" | "CTO" | "COO" | "CPO" | "Other";
  email: string;
  linkedin?: string | null;
  github?: string | null;
  website?: string | null;
  location: string;
  expertise: string[];
  founderScore: number;
  scoreTrend: Trend;
  components: FounderComponent[];
  history: FounderEvent[];
  projects: string[];
  contactStatus: ContactStatus;
  contradictionCount: number;
  bio: string;
}

export interface Deal {
  id: string;
  company: string;
  tagline: string;
  sector: string;
  stage: string;
  geography: string;
  source: SourceType;
  isColdStart?: boolean;
  pipelineStage: PipelineStage;
  timeInStageHours: number;
  nextAction: string;
  founderIds: string[];
  founderAxis: { score: number; trend: Trend; summary: string; note: string };
  market: { rating: MarketRating; trend: Trend; tam: string; summary: string; competitors: string[] };
  ideaVsMarket: { score: number; trend: Trend; verdict: string; flexibility: string };
  teamCoverage: { area: string; rating: CoverageRating; note?: string }[];
  verifications: number;
  alerts: number;
  links: { label: string; href: string | null }[];
  claims: Claim[];
  memo: {
    snapshot: string;
    hypotheses: string[];
    swot: { strengths: string[]; weaknesses: string[]; opportunities: string[]; risks: string[] };
    problemProduct: string;
    traction: { label: string; value: string }[];
  };
  askUsd: number;
  createdAt: string;
  decisionDeadline: string;
  starred?: boolean;
  firstSignalAt?: string | null;          // additive: speed instrumentation
  decidedAt?: string | null;
  signalToDecisionHours?: number | null;
}

export const FOUNDERS: Founder[] = [
  {
    id: "amara-okafor", name: "Amara Okafor", role: "CEO",
    email: "amara@helix.run", linkedin: "https://linkedin.com/in/amaraokafor", github: "https://github.com/amaraok", website: null,
    location: "San Francisco, US", expertise: ["Distributed systems", "Payments infra", "OSS"],
    founderScore: 92, scoreTrend: "up",
    components: [
      { label: "Shipped Projects (4)", points: 30 },
      { label: "Consistency (7yr commit streak)", points: 20 },
      { label: "Prior Exit (acqui-hire, Stripe)", points: 22 },
      { label: "Domain Depth (distributed systems)", points: 12 },
      { label: "Community Signal (12k GH followers)", points: 8 },
    ],
    history: [
      { date: "2019-04-12", event: "Joined Stripe Payments Infra", source: "LinkedIn", delta: 6 },
      { date: "2022-09-01", event: "Acqui-hire by Stripe", source: "TechCrunch", delta: 14 },
      { date: "2024-11-03", event: "Launched OSS helix-core", source: "GitHub", delta: 8 },
      { date: "2025-06-20", event: "helix-core crossed 5k stars", source: "GitHub API", delta: 5 },
      { date: "2026-03-14", event: "Recruited 2 senior ICs", source: "LinkedIn", delta: 4 },
    ],
    projects: ["helix"], contactStatus: "In Diligence", contradictionCount: 0,
    bio: "Repeat technical founder with prior acqui-hire and deep distributed-systems credibility. Ships in public.",
  },
  {
    id: "david-chen", name: "David Chen", role: "CTO",
    email: "david@helix.run", linkedin: "https://linkedin.com/in/davidchen", github: "https://github.com/dchenml", website: null,
    location: "San Francisco, US", expertise: ["ML systems", "Kubernetes", "Inference"],
    founderScore: 84, scoreTrend: "up",
    components: [
      { label: "Shipped Projects (3)", points: 22 },
      { label: "Domain Depth (ML infra)", points: 22 },
      { label: "Community Signal (2k GH followers)", points: 6 },
      { label: "Formal Track Record (Anthropic staff eng)", points: 20 },
      { label: "Consistency", points: 14 },
    ],
    history: [
      { date: "2023-01-10", event: "Joined Anthropic as staff eng", source: "LinkedIn", delta: 10 },
      { date: "2026-01-04", event: "Left Anthropic for Helix", source: "LinkedIn", delta: 6 },
    ],
    projects: ["helix"], contactStatus: "In Diligence", contradictionCount: 0,
    bio: "Ex-Anthropic staff engineer on inference infra. Complements Amara's payments-infra background.",
  },
  {
    id: "maya-brooks", name: "Maya Brooks", role: "COO",
    email: "maya@helix.run", linkedin: "https://linkedin.com/in/mayabrooks", github: null, website: null,
    location: "New York, US", expertise: ["Enterprise sales", "GTM", "Fintech"],
    founderScore: 79, scoreTrend: "flat",
    components: [
      { label: "Enterprise sales (Snowflake, Databricks)", points: 26 },
      { label: "Prior startup (Series B ops lead)", points: 18 },
      { label: "Consistency", points: 16 },
      { label: "Formal Track Record", points: 19 },
    ],
    history: [
      { date: "2021-07-01", event: "Ops lead at Series B fintech", source: "LinkedIn", delta: 8 },
      { date: "2026-02-11", event: "Joined Helix as COO", source: "LinkedIn", delta: 4 },
    ],
    projects: ["helix"], contactStatus: "In Diligence", contradictionCount: 0,
    bio: "GTM operator with enterprise-infra sales background.",
  },
  {
    id: "julian-reyes", name: "Julian Reyes", role: "CEO",
    email: "julian@quantex.health", linkedin: "https://linkedin.com/in/julianreyes", github: "https://github.com/jreyes", website: null,
    location: "Austin, US", expertise: ["Healthcare RCM", "Consulting"],
    founderScore: 58, scoreTrend: "flat",
    components: [
      { label: "Shipped Projects (1)", points: 12 },
      { label: "Consistency", points: 10 },
      { label: "Domain Access", points: 18 },
      { label: "Community Signal", points: 6 },
      { label: "Formal Track Record (McKinsey)", points: 12 },
    ],
    history: [
      { date: "2019-06-01", event: "McKinsey Associate Partner", source: "LinkedIn", delta: 12 },
      { date: "2026-04-02", event: "Claim contradicted: ARR vs waitlist", source: "Artifact scan", delta: -8 },
    ],
    projects: ["quantex"], contactStatus: "In Diligence", contradictionCount: 2,
    bio: "First-time technical founder with strong domain access. Recent contradictions on revenue and logos.",
  },
  {
    id: "kestrel-vance", name: "Kestrel Vance", role: "CEO",
    email: "k@loom.dev", linkedin: null, github: "https://github.com/kestrelv", website: "https://kestrelv.dev",
    location: "Berlin, Europe", expertise: ["Systems design", "Developer tools", "Local-first"],
    founderScore: 71, scoreTrend: "up",
    components: [
      { label: "Public Writing (58 essays, 4yr)", points: 26 },
      { label: "Shipped Projects (2 personal)", points: 14 },
      { label: "Consistency (daily blog cadence)", points: 18 },
      { label: "Community Signal (9k Substack)", points: 10 },
      { label: "Formal Track Record", points: 3 },
    ],
    history: [
      { date: "2022-01-04", event: "Started weekly essay cadence", source: "Substack", delta: 6 },
      { date: "2024-08-11", event: "shellbook crossed 1k stars", source: "GitHub", delta: 8 },
      { date: "2026-05-01", event: "loom.dev waitlist crossed 1,850", source: "Product page", delta: 5 },
    ],
    projects: ["loom", "loom-notebook"], contactStatus: "In Diligence", contradictionCount: 0,
    bio: "Cold-start founder: no formal pedigree but four years of public technical writing and two successful side-projects.",
  },
  {
    id: "ferrous-wheel", name: "Elena Marchetti", role: "CTO",
    email: "elena@voyager.eng", linkedin: "https://linkedin.com/in/emarchetti", github: "https://github.com/ferrouswheel", website: null,
    location: "Zurich, Europe", expertise: ["Rust", "Distributed schedulers"],
    founderScore: 76, scoreTrend: "up",
    components: [
      { label: "OSS Community (ferrous_wheel)", points: 22 },
      { label: "Show HN #1 (312 pts)", points: 18 },
      { label: "Formal Track Record (CERN eng)", points: 20 },
      { label: "Consistency", points: 16 },
    ],
    history: [
      { date: "2026-07-16", event: "Show HN: deterministic scheduler (312 pts)", source: "Hacker News", delta: 10 },
    ],
    projects: ["voyager"], contactStatus: "Reviewing", contradictionCount: 0,
    bio: "Rust systems engineer discovered via Show HN. Prior CERN infra work; strong OSS following.",
  },
  {
    id: "harper-lin", name: "Harper Lin", role: "CEO",
    email: "harper@northgrid.co", linkedin: "https://linkedin.com/in/harperlin", github: null, website: null,
    location: "Toronto, Canada", expertise: ["Enterprise SaaS", "Product"],
    founderScore: 44, scoreTrend: "down",
    components: [
      { label: "Prior PM (mid-market SaaS)", points: 18 },
      { label: "Shipped Projects", points: 8 },
      { label: "Community Signal", points: 4 },
      { label: "Consistency", points: 14 },
    ],
    history: [
      { date: "2026-06-10", event: "Contradiction: growth chart vs Stripe", source: "Stripe connector", delta: -12 },
    ],
    projects: ["northgrid"], contactStatus: "Reviewing", contradictionCount: 3,
    bio: "First-time founder; recent diligence surfaced material inconsistencies.",
  },
  {
    id: "sana-iqbal", name: "Sana Iqbal", role: "CEO",
    email: "sana@brickline.co", linkedin: "https://linkedin.com/in/sanaiqbal", github: "https://github.com/saniqbal", website: null,
    location: "London, Europe", expertise: ["Construction tech", "Product", "Ops"],
    founderScore: 66, scoreTrend: "flat",
    components: [
      { label: "Domain Depth (ex-Procore PM)", points: 20 },
      { label: "Consistency", points: 14 },
      { label: "Shipped Projects", points: 16 },
      { label: "Community Signal", points: 6 },
      { label: "Formal Track Record", points: 10 },
    ],
    history: [
      { date: "2025-11-01", event: "Left Procore to start Brickline", source: "LinkedIn", delta: 4 },
    ],
    projects: ["brickline"], contactStatus: "Reviewing", contradictionCount: 0,
    bio: "Domain-expert PM building vertical SaaS for mid-market construction. Steady, no major flags.",
  },
  {
    id: "noor-halabi", name: "Noor Halabi", role: "CEO",
    email: "noor@mendel.bio", linkedin: "https://linkedin.com/in/noorhalabi", github: "https://github.com/noorhalabi", website: null,
    location: "Boston, US", expertise: ["Computational bio", "ML", "OSS"],
    founderScore: 81, scoreTrend: "up",
    components: [
      { label: "PhD (Broad Institute)", points: 22 },
      { label: "OSS mendel-kit (3.4k stars)", points: 20 },
      { label: "Public Writing", points: 12 },
      { label: "Consistency", points: 16 },
      { label: "Community Signal", points: 11 },
    ],
    history: [
      { date: "2026-05-22", event: "mendel-kit crossed 3k stars", source: "GitHub API", delta: 6 },
    ],
    projects: ["mendel"], contactStatus: "Discovered", contradictionCount: 0,
    bio: "Computational bio PhD with strong OSS distribution. Outbound discovery.",
  },
];

const nowIso = new Date().toISOString();
const deadlineIn = (h: number) => new Date(Date.now() + h * 3600 * 1000).toISOString();

export const DEALS: Deal[] = [
  {
    id: "helix", company: "Helix Runtime",
    tagline: "Deterministic runtime for multi-agent LLM systems.",
    sector: "AI Infra", stage: "Seed", geography: "US",
    source: "Outbound Discovery via GitHub",
    pipelineStage: "Diligence", timeInStageHours: 22,
    nextAction: "Review three-axis scorecard and finalize decision note.",
    founderIds: ["amara-okafor", "david-chen", "maya-brooks"],
    founderAxis: {
      score: 90, trend: "up",
      summary: "Three-person team with complementary payments-infra, ML, and enterprise-GTM coverage.",
      note: "Founder Axis is the TEAM view in context of THIS opportunity — distinct from any single Founder Score.",
    },
    market: { rating: "Bullish", trend: "up", tam: "$28B by 2028 (Gartner, AI Infra)",
      summary: "Runtime layer under-served vs. framework layer.",
      competitors: ["LangGraph", "Temporal", "Inngest"] },
    ideaVsMarket: { score: 88, trend: "up",
      verdict: "Determinism is a real, technical unlock.",
      flexibility: "Team refactored core scheduler in public — high engineering flexibility." },
    teamCoverage: [
      { area: "Product", rating: "Strong", note: "Amara + Maya" },
      { area: "Engineering", rating: "Strong" },
      { area: "AI / domain", rating: "Strong", note: "David ex-Anthropic" },
      { area: "Enterprise sales", rating: "Moderate", note: "Maya, pre-first-hire" },
      { area: "Marketing", rating: "Weak" },
      { area: "Finance", rating: "Moderate" },
      { area: "Operations", rating: "Moderate" },
    ],
    verifications: 6, alerts: 0,
    links: [
      { label: "Pitch Deck", href: null },
      { label: "GitHub", href: "https://github.com/helix-run/helix-core" },
      { label: "Website", href: "https://helix.run" },
    ],
    claims: [
      { id: "helix-c1", claim: "Amara is ex-Stripe Payments Infra", status: "verified", trustScore: 96,
        detail: "LinkedIn API + public Stripe engineering blog (2021).",
        source: "LinkedIn API", sourceUrl: "https://linkedin.com/in/amaraokafor",
        collectedAt: "2026-07-15", verifiedAt: "2026-07-16",
        aiExplanation: "Two independent sources agree on tenure and role." },
      { id: "helix-c2", claim: "helix-core has 8,400 GitHub stars", status: "verified", trustScore: 99,
        detail: "GitHub API returned 8,412 stars on 2026-07-17.",
        source: "GitHub API", sourceUrl: "https://github.com/helix-run/helix-core",
        collectedAt: "2026-07-17", verifiedAt: "2026-07-17",
        aiExplanation: "Direct API read." },
      { id: "helix-c3", claim: "Design partner: Fortune-500 fintech", status: "verified", trustScore: 88,
        detail: "LOI PDF present, countersigned 2026-06-02.",
        source: "Deck artifact", sourceUrl: null,
        collectedAt: "2026-07-14", verifiedAt: "2026-07-15",
        aiExplanation: "Signed artifact present." },
      { id: "helix-c4", claim: "TAM $28B by 2028", status: "unverified", trustScore: 52,
        detail: "Cited Gartner figure; not machine-verified.",
        source: "Deck", sourceUrl: null, collectedAt: "2026-07-14",
        aiExplanation: "Directional; TAM routinely un-auditable at this stage." },
      { id: "helix-c5", claim: "$180K in signed pilots", status: "verified", trustScore: 94,
        detail: "Two invoices cross-referenced against Mercury export.",
        source: "Mercury export", sourceUrl: null,
        collectedAt: "2026-07-16", verifiedAt: "2026-07-16",
        aiExplanation: "Bank-connector confirmation." },
      { id: "helix-c6", claim: "Team size: 4 engineers", status: "verified", trustScore: 92,
        detail: "Matched against LinkedIn + GitHub commit authors.",
        source: "LinkedIn + GitHub", sourceUrl: null,
        collectedAt: "2026-07-15", verifiedAt: "2026-07-15",
        aiExplanation: "Two independent sources agree." },
    ],
    memo: {
      snapshot: "Deterministic execution layer for multi-agent LLM systems.",
      hypotheses: [
        "Runtime, not framework, is where enterprise AI teams consolidate spend in 2026-2027.",
        "Determinism + replay unlocks regulated verticals.",
        "Repeat technical founder compresses time-to-design-partner.",
      ],
      swot: {
        strengths: ["Repeat founder", "Verified pilots and design partners", "OSS distribution"],
        weaknesses: ["No commercial GTM hire", "Pricing evolving"],
        opportunities: ["Regulated vertical wedge", "OSS -> enterprise conversion"],
        risks: ["Framework players move down-stack", "Hyperscaler bundles native runtime"],
      },
      problemProduct: "Agent frameworks are non-deterministic. Helix wraps agents in a durable event-sourced scheduler with typed handoff contracts.",
      traction: [
        { label: "Signed pilot revenue", value: "$180,000" },
        { label: "Design partners", value: "3 (1 Fortune-500 fintech)" },
        { label: "OSS stars", value: "8,412 (+2,100 last 30d)" },
        { label: "Team size", value: "4 engineers" },
        { label: "Cap table", value: "Not Disclosed" },
        { label: "Runway", value: "Unavailable at this stage" },
      ],
    },
    askUsd: 100000, createdAt: nowIso, decisionDeadline: deadlineIn(23.5),
  },
  {
    id: "quantex", company: "Quantex Health",
    tagline: "AI-native revenue-cycle automation for outpatient clinics.",
    sector: "B2B SaaS", stage: "Seed", geography: "US",
    source: "Inbound Application",
    pipelineStage: "Diligence", timeInStageHours: 18,
    nextAction: "Resolve two open contradictions before decision.",
    founderIds: ["julian-reyes"],
    founderAxis: {
      score: 54, trend: "down",
      summary: "Solo founder; coverage gaps dominate team-in-context.",
      note: "Composition risk: single-founder, no engineering #2 yet.",
    },
    market: { rating: "Neutral", trend: "flat", tam: "$12B (US ambulatory RCM)",
      summary: "Large market, entrenched incumbents.",
      competitors: ["Athenahealth", "Waystar", "Candid Health", "Adonis"] },
    ideaVsMarket: { score: 52, trend: "down",
      verdict: "Idea survives, but positioning narrower than market rewards.",
      flexibility: "Solo technical founder — pivot bandwidth constrained." },
    teamCoverage: [
      { area: "Product", rating: "Moderate" },
      { area: "Engineering", rating: "Weak", note: "solo, hiring #2" },
      { area: "AI / domain", rating: "Strong" },
      { area: "Enterprise sales", rating: "Unknown" },
      { area: "Marketing", rating: "Missing" },
      { area: "Finance", rating: "Unknown" },
      { area: "Operations", rating: "Weak" },
    ],
    verifications: 3, alerts: 2,
    links: [
      { label: "Pitch Deck", href: null },
      { label: "Website", href: "https://quantex.health" },
    ],
    claims: [
      { id: "qx-c1", claim: "Founder is ex-McKinsey healthcare partner", status: "verified", trustScore: 93,
        detail: "LinkedIn API — Associate Partner 2019-2023.",
        source: "LinkedIn API", sourceUrl: "https://linkedin.com/in/julianreyes",
        collectedAt: "2026-07-10", verifiedAt: "2026-07-11", aiExplanation: "Tenure verified." },
      { id: "qx-c2", claim: "$500K ARR live", status: "contradicted", trustScore: 12,
        detail: "Product artifact shows 'Private beta — request access'. Stripe connector returns 0 subscriptions.",
        source: "Live artifact scan", sourceUrl: "https://quantex.health",
        collectedAt: "2026-07-12", verifiedAt: "2026-07-12",
        conflictingEvidence: "Public product page shows waitlist; Stripe connector returns 0 subscriptions.",
        aiExplanation: "Two independent signals contradict the deck." },
      { id: "qx-c3", claim: "12 signed enterprise customers", status: "contradicted", trustScore: 22,
        detail: "Only 2 of 12 logos publicly acknowledged.",
        source: "Press + LinkedIn cross-check", sourceUrl: null,
        collectedAt: "2026-07-12", conflictingEvidence: "10 of 12 logos yield zero public acknowledgment.",
        aiExplanation: "Public silence at this scale is unusual." },
      { id: "qx-c4", claim: "TAM is $45B", status: "unverified", trustScore: 48,
        detail: "External source unverified.",
        source: "Deck", sourceUrl: null, collectedAt: "2026-07-10", aiExplanation: "Directional TAM." },
      { id: "qx-c5", claim: "HIPAA compliant", status: "unverified", trustScore: 35,
        detail: "No BAA documentation surfaced.",
        source: "Deck footnote", sourceUrl: null, collectedAt: "2026-07-10",
        aiExplanation: "Absence of BAA is meaningful for healthcare." },
      { id: "qx-c6", claim: "Advised by former Athenahealth VP", status: "verified", trustScore: 84,
        detail: "Advisor confirmed via personal LinkedIn post.",
        source: "LinkedIn", sourceUrl: "https://linkedin.com/feed", collectedAt: "2026-07-10", verifiedAt: "2026-07-10",
        aiExplanation: "Advisor self-confirmed publicly." },
    ],
    memo: {
      snapshot: "AI-native RCM for outpatient clinics. Compelling founder-market fit, but material deck-vs-artifact contradictions.",
      hypotheses: [
        "Ambulatory RCM is under-automated.",
        "Founder's clinic-group access could compress design-partner acquisition.",
      ],
      swot: {
        strengths: ["Domain access", "Verified advisor", "Large TAM"],
        weaknesses: ["Solo technical founder", "No verified revenue", "Compliance unclear"],
        opportunities: ["AI-native vs legacy RCM"],
        risks: ["Deck-vs-artifact contradictions", "Long sales cycles"],
      },
      problemProduct: "Outpatient clinics lose 6-11% of revenue to coding errors. Quantex plans to auto-generate claims from EHR events. Currently in private beta.",
      traction: [
        { label: "Live revenue", value: "Not Disclosed (deck claim contradicted)" },
        { label: "Verified customers", value: "2 publicly acknowledged" },
        { label: "Waitlist signups", value: "340" },
        { label: "Team size", value: "1 founder + 2 contractors" },
        { label: "Cap table", value: "Not Disclosed" },
        { label: "Compliance", value: "Unavailable at this stage" },
      ],
    },
    askUsd: 100000, createdAt: nowIso, decisionDeadline: deadlineIn(18),
  },
  {
    id: "loom", company: "loom.dev",
    tagline: "Local-first developer notebook for shell + AI workflows.",
    sector: "DevTools", stage: "Pre-Seed", geography: "Europe",
    source: "Cold-Start Founder", isColdStart: true,
    pipelineStage: "Screening", timeInStageHours: 6,
    nextAction: "Complete Trust Radar scan and schedule founder call.",
    founderIds: ["kestrel-vance"],
    founderAxis: {
      score: 68, trend: "up",
      summary: "Solo cold-start. Wider uncertainty than typical Seed.",
      note: "Different from individual Founder Score — solo team has structural coverage gaps.",
    },
    market: { rating: "Neutral", trend: "up", tam: "$4.2B (developer productivity)",
      summary: "Crowded but 'notebook' framing under-explored.",
      competitors: ["Warp", "Raycast", "Jupyter"] },
    ideaVsMarket: { score: 64, trend: "up",
      verdict: "Reasonable-but-narrow wedge. Expect 2-3 pivots.",
      flexibility: "Public writing shows demonstrable pattern of updating priors." },
    teamCoverage: [
      { area: "Product", rating: "Moderate" },
      { area: "Engineering", rating: "Strong", note: "solo but shipping" },
      { area: "AI / domain", rating: "Moderate" },
      { area: "Enterprise sales", rating: "Missing" },
      { area: "Marketing", rating: "Strong", note: "Substack distribution" },
      { area: "Finance", rating: "Unknown" },
      { area: "Operations", rating: "Weak" },
    ],
    verifications: 3, alerts: 0,
    links: [
      { label: "Pitch Deck", href: null },
      { label: "GitHub", href: "https://github.com/kestrelv/shellbook" },
      { label: "Substack", href: "https://kestrelv.substack.com" },
      { label: "Personal site", href: "https://kestrelv.dev" },
    ],
    claims: [
      { id: "loom-c1", claim: "Publishes 1 essay/week for 4 years", status: "verified", trustScore: 97,
        detail: "58 posts across 208 weeks, no gap > 21 days.",
        source: "Substack scrape", sourceUrl: "https://kestrelv.substack.com",
        collectedAt: "2026-07-10", verifiedAt: "2026-07-10", aiExplanation: "Deterministic archive count." },
      { id: "loom-c2", claim: "9,200 Substack subscribers", status: "verified", trustScore: 91,
        detail: "Public subscriber count matches.", source: "Substack",
        sourceUrl: "https://kestrelv.substack.com", collectedAt: "2026-07-10", verifiedAt: "2026-07-10",
        aiExplanation: "Public counter." },
      { id: "loom-c3", claim: "shellbook has 1,100 GitHub stars", status: "verified", trustScore: 98,
        detail: "GitHub API returned 1,142 stars.", source: "GitHub API",
        sourceUrl: "https://github.com/kestrelv/shellbook", collectedAt: "2026-07-17", verifiedAt: "2026-07-17",
        aiExplanation: "Direct API." },
      { id: "loom-c4", claim: "Formal employer track record", status: "unverified", trustScore: 30,
        detail: "No LinkedIn presence beyond a stub.",
        source: "n/a", sourceUrl: null, collectedAt: "2026-07-10",
        aiExplanation: "Cold-start founder — absence is neutral, not disqualifying." },
      { id: "loom-c5", claim: "18-month personal runway solo", status: "unverified", trustScore: 40,
        detail: "Founder-reported; not independently verifiable.",
        source: "Founder-reported", sourceUrl: null, collectedAt: "2026-07-10",
        aiExplanation: "Self-reported without bank connector." },
    ],
    memo: {
      snapshot: "Local-first developer notebook unifying shell, AI prompts, and executable notes.",
      hypotheses: [
        "Cold-start founders with dense public footprints are systematically underpriced.",
        "Developer notebooks under-explored.",
        "Local-first + AI durable as cloud AI costs rise.",
      ],
      swot: {
        strengths: ["Exceptional writing cadence", "Two organic shipped projects"],
        weaknesses: ["No prior venture", "Solo", "No formal signal"],
        opportunities: ["Substack distribution", "OSS-first GTM"],
        risks: ["Crowded devtools", "Solo-founder risk"],
      },
      problemProduct: "Developers stitch shell + editor + AI + notes across 4+ tools. loom.dev is a single notebook where cells can be shell, code, or LLM prompts.",
      traction: [
        { label: "Live revenue", value: "Not Disclosed" },
        { label: "Newsletter subscribers", value: "9,200" },
        { label: "Side-project stars", value: "1,142 (shellbook)" },
        { label: "Waitlist", value: "1,850" },
        { label: "Team size", value: "1 (solo)" },
        { label: "Cap table", value: "Not Disclosed" },
        { label: "Runway", value: "Unavailable at this stage" },
      ],
    },
    askUsd: 100000, createdAt: nowIso, decisionDeadline: deadlineIn(20),
  },
  {
    id: "voyager", company: "Voyager Systems",
    tagline: "Rust-native scheduler for LLM agents (from Show HN).",
    sector: "AI Infra", stage: "Pre-Seed", geography: "Europe",
    source: "Outbound — Show HN",
    pipelineStage: "Invited", timeInStageHours: 4,
    nextAction: "Founder responded — send application link.",
    founderIds: ["ferrous-wheel"],
    founderAxis: { score: 74, trend: "up",
      summary: "Solo CTO with strong OSS + prior CERN infra work.",
      note: "Composition still solo — GTM and product coverage gaps." },
    market: { rating: "Bullish", trend: "up", tam: "$28B (shared with Helix)",
      summary: "Same wedge as Helix. Portfolio construction risk.",
      competitors: ["Helix Runtime", "LangGraph", "Temporal"] },
    ideaVsMarket: { score: 70, trend: "up",
      verdict: "Rust angle is real.", flexibility: "Single founder; limited until team forms." },
    teamCoverage: [
      { area: "Product", rating: "Weak" }, { area: "Engineering", rating: "Strong" },
      { area: "AI / domain", rating: "Moderate" }, { area: "Enterprise sales", rating: "Missing" },
      { area: "Marketing", rating: "Moderate", note: "HN traction" }, { area: "Finance", rating: "Unknown" },
      { area: "Operations", rating: "Missing" },
    ],
    verifications: 2, alerts: 0,
    links: [
      { label: "Show HN post", href: "https://news.ycombinator.com" },
      { label: "GitHub", href: "https://github.com/ferrouswheel" },
    ],
    claims: [
      { id: "voy-c1", claim: "Show HN post reached 312 points", status: "verified", trustScore: 99,
        detail: "HN API confirms 312 pts, 84 comments.", source: "HN API", sourceUrl: "https://news.ycombinator.com",
        collectedAt: "2026-07-16", verifiedAt: "2026-07-16", aiExplanation: "Direct API." },
      { id: "voy-c2", claim: "Founder was CERN infra engineer", status: "verified", trustScore: 82,
        detail: "LinkedIn tenure confirmed, publications match.", source: "LinkedIn",
        sourceUrl: "https://linkedin.com/in/emarchetti", collectedAt: "2026-07-16", verifiedAt: "2026-07-17",
        aiExplanation: "Public tenure + academic publications concur." },
    ],
    memo: {
      snapshot: "Rust-native deterministic scheduler discovered via Show HN.",
      hypotheses: ["Rust runtime pitched at reliability-first buyers", "Overlaps with Helix"],
      swot: {
        strengths: ["Strong HN reception", "Solid infra background"],
        weaknesses: ["Solo founder", "No GTM plan"],
        opportunities: ["Reliability-first buyers"], risks: ["Overlap with Helix", "Solo execution"],
      },
      problemProduct: "Same category as Helix — Rust-native and single-node first.",
      traction: [
        { label: "HN score", value: "312 pts" }, { label: "Team size", value: "1 (solo)" },
        { label: "Live revenue", value: "Not Disclosed" }, { label: "Runway", value: "Unavailable at this stage" },
      ],
    },
    askUsd: 100000, createdAt: nowIso, decisionDeadline: deadlineIn(23),
  },
  {
    id: "northgrid", company: "NorthGrid",
    tagline: "Mid-market SaaS for utility field-ops scheduling.",
    sector: "B2B SaaS", stage: "Seed", geography: "US",
    source: "Inbound Application",
    pipelineStage: "Decision Ready", timeInStageHours: 26,
    nextAction: "Recommend Decline — three material contradictions unresolved.",
    founderIds: ["harper-lin"],
    founderAxis: { score: 42, trend: "down",
      summary: "First-time founder with pattern of overstated claims.",
      note: "Not recommended for check on current data package." },
    market: { rating: "Neutral", trend: "flat", tam: "$3.4B (utility field-service)",
      summary: "Real market; incumbents slow but sticky.",
      competitors: ["ServiceMax", "FieldEdge", "IFS"] },
    ideaVsMarket: { score: 38, trend: "down",
      verdict: "Idea plausible but current execution fails diligence.",
      flexibility: "Low — no evidence of pivot capacity." },
    teamCoverage: [
      { area: "Product", rating: "Weak" }, { area: "Engineering", rating: "Weak" },
      { area: "AI / domain", rating: "Missing" }, { area: "Enterprise sales", rating: "Missing" },
      { area: "Marketing", rating: "Weak" }, { area: "Finance", rating: "Unknown" }, { area: "Operations", rating: "Weak" },
    ],
    verifications: 1, alerts: 3,
    links: [
      { label: "Pitch Deck", href: null }, { label: "Website", href: "https://northgrid.co" },
    ],
    claims: [
      { id: "ng-c1", claim: "MRR growth 40% MoM", status: "contradicted", trustScore: 8,
        detail: "Stripe connector shows flat MRR across 6 months.",
        source: "Stripe connector", sourceUrl: null, collectedAt: "2026-07-14",
        conflictingEvidence: "Deck growth chart contradicted by direct Stripe export.",
        aiExplanation: "Direct financial connector overrides deck." },
      { id: "ng-c2", claim: "20 paying customers", status: "contradicted", trustScore: 18,
        detail: "Stripe shows 6 active subscriptions.",
        source: "Stripe connector", sourceUrl: null, collectedAt: "2026-07-14",
        conflictingEvidence: "6 active vs 20 claimed.", aiExplanation: "Off by 3x." },
      { id: "ng-c3", claim: "SOC 2 in progress", status: "contradicted", trustScore: 22,
        detail: "Vanta/Drata/Secureframe trust pages show no listing.",
        source: "Public trust registries", sourceUrl: null, collectedAt: "2026-07-14",
        aiExplanation: "Not conclusive but unusual." },
      { id: "ng-c4", claim: "Founder was PM at mid-market SaaS", status: "verified", trustScore: 84,
        detail: "LinkedIn tenure confirmed.", source: "LinkedIn API",
        sourceUrl: "https://linkedin.com/in/harperlin", collectedAt: "2026-07-10", verifiedAt: "2026-07-11",
        aiExplanation: "Baseline verified." },
    ],
    memo: {
      snapshot: "Utility field-ops SaaS. Multiple material contradictions with financial connectors.",
      hypotheses: ["Field-ops incumbents catchable if honesty improves"],
      swot: {
        strengths: ["Real market"], weaknesses: ["Multiple contradictions", "Weak coverage"],
        opportunities: ["Slow incumbents"], risks: ["Data integrity failure at diligence"],
      },
      problemProduct: "Utility field crews use pen and paper. Product is a scheduler and dispatch tool. Traction claims contradicted.",
      traction: [
        { label: "Stated MRR growth", value: "40% MoM (contradicted)" },
        { label: "Verified MRR trend", value: "Flat (6mo)" },
        { label: "Paying customers", value: "6 verified, 20 claimed" },
        { label: "Cap table", value: "Not Disclosed" },
      ],
    },
    askUsd: 100000, createdAt: nowIso, decisionDeadline: deadlineIn(6),
  },
  {
    id: "brickline", company: "Brickline",
    tagline: "Vertical SaaS for mid-market construction ops.",
    sector: "B2B SaaS", stage: "Seed", geography: "Europe",
    source: "Inbound — Referral",
    pipelineStage: "Screening", timeInStageHours: 12,
    nextAction: "Solid but not exceptional — likely Pass unless thesis widens.",
    founderIds: ["sana-iqbal"],
    founderAxis: { score: 62, trend: "flat",
      summary: "Competent solo domain-expert; no team yet.",
      note: "Steady, unremarkable — inside thesis but below bar." },
    market: { rating: "Neutral", trend: "flat", tam: "$8B (construction ops)",
      summary: "Procore owns top; mid-market underserved.", competitors: ["Procore", "PlanGrid", "Autodesk"] },
    ideaVsMarket: { score: 55, trend: "flat",
      verdict: "Reasonable wedge but capital-intensive GTM.", flexibility: "Moderate — domain-locked." },
    teamCoverage: [
      { area: "Product", rating: "Strong" }, { area: "Engineering", rating: "Weak" },
      { area: "AI / domain", rating: "Missing" }, { area: "Enterprise sales", rating: "Moderate" },
      { area: "Marketing", rating: "Weak" }, { area: "Finance", rating: "Unknown" }, { area: "Operations", rating: "Moderate" },
    ],
    verifications: 2, alerts: 0,
    links: [
      { label: "Pitch Deck", href: null }, { label: "Website", href: "https://brickline.co" },
      { label: "LinkedIn", href: "https://linkedin.com/in/sanaiqbal" },
    ],
    claims: [
      { id: "bl-c1", claim: "Ex-Procore product manager", status: "verified", trustScore: 92,
        detail: "LinkedIn confirms 3-year tenure.", source: "LinkedIn API",
        sourceUrl: "https://linkedin.com/in/sanaiqbal", collectedAt: "2026-07-12", verifiedAt: "2026-07-13",
        aiExplanation: "Standard tenure verification." },
      { id: "bl-c2", claim: "4 design partners signed", status: "unverified", trustScore: 55,
        detail: "LOIs referenced but not provided.", source: "Deck", sourceUrl: null,
        collectedAt: "2026-07-12", aiExplanation: "Request LOI copies before decision." },
    ],
    memo: {
      snapshot: "Vertical SaaS for construction. Competent solo founder, capital-intensive.",
      hypotheses: ["Mid-market underserved by Procore"],
      swot: {
        strengths: ["Domain depth"], weaknesses: ["Solo", "Cap-intensive GTM"],
        opportunities: ["Mid-market"], risks: ["Procore moves down-market"],
      },
      problemProduct: "Construction firms use spreadsheets. Brickline is a mobile-first ops tool.",
      traction: [
        { label: "Design partners", value: "4 (LOIs referenced)" },
        { label: "Live revenue", value: "Not Disclosed" }, { label: "Team size", value: "1 + 1 contractor" },
      ],
    },
    askUsd: 100000, createdAt: nowIso, decisionDeadline: deadlineIn(15),
  },
  {
    id: "mendel", company: "Mendel Bio",
    tagline: "OSS toolkit for computational biology pipelines.",
    sector: "AI Infra", stage: "Pre-Seed", geography: "US",
    source: "Outbound Discovery via GitHub",
    pipelineStage: "Sourced", timeInStageHours: 2,
    nextAction: "Invite founder to apply — 3.4k stars + PhD credentials.",
    founderIds: ["noor-halabi"],
    founderAxis: { score: 72, trend: "up",
      summary: "Strong individual, solo — composition unknown.",
      note: "Outbound; not yet contacted." },
    market: { rating: "Neutral", trend: "up", tam: "$6B (computational bio tooling)",
      summary: "Niche but sticky.", competitors: ["Benchling", "Latch Bio", "Seqera"] },
    ideaVsMarket: { score: 62, trend: "up",
      verdict: "OSS wedge with academic distribution.", flexibility: "Moderate." },
    teamCoverage: [
      { area: "Product", rating: "Unknown" }, { area: "Engineering", rating: "Strong" },
      { area: "AI / domain", rating: "Strong" }, { area: "Enterprise sales", rating: "Unknown" },
      { area: "Marketing", rating: "Unknown" }, { area: "Finance", rating: "Unknown" }, { area: "Operations", rating: "Unknown" },
    ],
    verifications: 1, alerts: 0,
    links: [ { label: "GitHub", href: "https://github.com/noorhalabi/mendel-kit" } ],
    claims: [
      { id: "md-c1", claim: "mendel-kit has 3.4k GitHub stars", status: "verified", trustScore: 99,
        detail: "GitHub API confirms 3,412 stars.", source: "GitHub API",
        sourceUrl: "https://github.com/noorhalabi/mendel-kit", collectedAt: "2026-07-18", verifiedAt: "2026-07-18",
        aiExplanation: "Direct API." },
    ],
    memo: {
      snapshot: "Outbound discovery. Strong OSS traction, PhD credentials, not yet contacted.",
      hypotheses: ["Academic-to-enterprise motion works for bio tooling"],
      swot: {
        strengths: ["OSS traction", "Domain credentials"], weaknesses: ["Unknown team composition"],
        opportunities: ["Bio tooling secular growth"], risks: ["Solo, unknown GTM"],
      },
      problemProduct: "Computational biology pipelines are fragmented. mendel-kit provides a unified OSS toolkit.",
      traction: [
        { label: "OSS stars", value: "3,412" }, { label: "Live revenue", value: "Unavailable at this stage" },
      ],
    },
    askUsd: 100000, createdAt: nowIso, decisionDeadline: deadlineIn(22),
  },
  {
    id: "loom-notebook", company: "Loom Notebook Studio",
    tagline: "Companion desktop app to loom.dev (same founder).",
    sector: "DevTools", stage: "Pre-Seed", geography: "Europe",
    source: "Inbound Application", isColdStart: true,
    pipelineStage: "Application Received", timeInStageHours: 1,
    nextAction: "Auto-linked to Kestrel Vance's existing founder profile.",
    founderIds: ["kestrel-vance"],
    founderAxis: { score: 65, trend: "up",
      summary: "Same founder as loom.dev — this is a companion product.",
      note: "Cross-project founder — merged into a single Founder profile." },
    market: { rating: "Neutral", trend: "up", tam: "$4.2B (developer productivity)",
      summary: "Extends loom.dev thesis into a native desktop client.", competitors: ["Warp", "Raycast"] },
    ideaVsMarket: { score: 60, trend: "flat",
      verdict: "Line extension of loom.dev; evaluate together.",
      flexibility: "Same founder constraints as loom.dev." },
    teamCoverage: [
      { area: "Product", rating: "Moderate" }, { area: "Engineering", rating: "Strong" },
      { area: "AI / domain", rating: "Moderate" }, { area: "Enterprise sales", rating: "Missing" },
      { area: "Marketing", rating: "Strong" }, { area: "Finance", rating: "Unknown" }, { area: "Operations", rating: "Weak" },
    ],
    verifications: 1, alerts: 0,
    links: [ { label: "Pitch Deck", href: null }, { label: "GitHub", href: "https://github.com/kestrelv" } ],
    claims: [
      { id: "ln-c1", claim: "Same founder as loom.dev (deduped in Founder Memory)", status: "verified", trustScore: 100,
        detail: "Email match: k@loom.dev.",
        source: "Founder Memory", sourceUrl: null, collectedAt: "2026-07-18", verifiedAt: "2026-07-18",
        aiExplanation: "Founder deduplication is deterministic." },
    ],
    memo: {
      snapshot: "Companion desktop app for loom.dev, same founder.",
      hypotheses: ["Notebook + native client together > either alone"],
      swot: { strengths: ["Existing waitlist"], weaknesses: ["Same solo-founder risk"], opportunities: [], risks: ["Attention split"] },
      problemProduct: "Native desktop shell for loom.dev cells.",
      traction: [ { label: "Team size", value: "1 (shared with loom.dev)" } ],
    },
    askUsd: 100000, createdAt: nowIso, decisionDeadline: deadlineIn(23.9),
  },
];

export const SOURCING_FEED = [
  { id: "s1", time: "2m", source: "Show HN", text: "New Show HN by 'ferrous_wheel' — deterministic scheduler for LLM agents (312 pts, 84 comments)" },
  { id: "s2", time: "14m", source: "GitHub", text: "Repo 'ai-agent-core' crossed 1,000 stars (was 620 seven days ago)" },
  { id: "s3", time: "31m", source: "Hackathon", text: "AI Engineer Summit — 'Voyager' won Best Infra track" },
  { id: "s4", time: "48m", source: "arXiv", text: "Paper 'Replayable Multi-Agent Traces' — CMU spinout authors" },
  { id: "s5", time: "1h", source: "LinkedIn", text: "Ex-Databricks staff eng marked 'Building something new' — 3 co-signals" },
  { id: "s6", time: "1h", source: "Product Hunt", text: "'shellbook' launched — #4 of the day" },
  { id: "s7", time: "2h", source: "GitHub", text: "Trending: 'edge-inference-router' — 480 stars in 24h, Berlin-based" },
  { id: "s8", time: "3h", source: "Substack", text: "Essay 'Why local-first AI wins on unit economics' — 12k views, 340 shares" },
  { id: "s9", time: "4h", source: "Discord", text: "Latent Space — new member 'k.vance' posted notes cited by 3 known founders" },
];

export type SourcingItem = (typeof SOURCING_FEED)[number];
