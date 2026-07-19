# 01 — Project Scope (Challenge 02: The VC Brain, distilled)

Source: Maschmeyer Group × Hack-Nation brief ("Deploying $100K Checks in 24 Hours"). Official PDF → docs/briefs/.

## The problem
Capital flows through networks, not merit. Founders stay invisible; diligence takes weeks. Build a system where any founder — connected or not — gets a $100K yes/no within 24 hours based on evidence.

## Scope
Covered: **Sourcing → Screening → Diligence → Decision**. Explicitly out: portfolio monitoring, follow-on, fund ops, exit ("don't spend hackathon time designing UI for them"). The "fund that runs itself" is ambition framing, not a deliverable.

## The three pillars
1. **Memory** — the data foundation. Nothing discarded. Ingests decks, launches, GitHub activity, social traction. Deduplicates, enriches, timestamps, source-tags. Houses the persistent Founder Score. Surfaces trends over time, not snapshots.
2. **Assessment & Intelligence** — the reasoning layer. Triggered by inbound applications OR by signals crossing a conviction threshold. Transparent about confidence, uncertainty, and evidence behind every conclusion.
3. **Experience** — investor-facing UX. "Notion-level approachability, Bloomberg-level analytical depth."

## MVP requirements (all eight)
1. **Thesis Engine** — configurable (sectors, stage, geography, check size, ownership, risk appetite); every recommendation filtered/scored through it. Hardcoded thesis misses the point.
2. **Smart data collection** — heterogeneous sources; the data layer matters as much as the intelligence on top.
3. **Multi-attribute reasoning** — compound natural-language queries resolved in one pass ("technical founder, Berlin, AI infra, enterprise traction, no prior VC backing"), not five manual filters.
4. **Inbound** — apply with deck + company name minimum (over-collecting counts against you); fast first-pass filter removes clear junk before full analysis.
5. **Outbound** — continuously scan GitHub, launches, hackathons, papers, accelerators; score discoveries the same as inbound applications; activate via real outreach; both tracks converge into ONE funnel.
6. **Multi-axis screening** — Founder / Market / Idea-vs-Market, independent, each with trend, NEVER averaged; feeds back into Memory.
7. **Evidence-backed memos + Trust Score** — per-claim tracing to evidence with confidence; external verification where possible; contradictions flagged before reaching the investor.
8. **Investor-grade UX** — usable without technical support.

## FAQ rulings (the graded traps)
- **Sourcing vs reasoning:** sourcing carries most weight and least competition — build sourcing deep, thin transparent intelligence over it. A polished reasoner over shallow data scores poorly.
- **Axes never averaged** — collapsing hides the disagreement an investor needs.
- **Founder Score vs 3-axis:** Founder Score lives in Memory, per person, never resets, follows the human across startups. 3-axis is per opportunity. Founder Score is one input to the founder axis, not a substitute.
- **Trust Score is per claim**, not one number per company.
- **Required memo sections:** Company snapshot, Investment hypotheses, SWOT, Problem & product, Traction & KPIs. Others optional; padding counts against you.
- **Missing data:** never fabricate — "Cap table: not disclosed". Marked gaps score as MORE trustworthy.
- **Cold-start (their Q10, the #1 differentiator):** generic ingestion won't score highly if it ignores pre-track-record founders. Need an explicit footprint-based method — otherwise you rebuilt the network-gated system the challenge replaces.
- **Best stretch goal if only one:** agentic traceability — exact data point behind each conclusion.
- **UI polish:** 15%, smallest slice; protect data + reasoning (55%) first.
- **No dataset provided:** bring/synthesize your own — public web data, synthetic profiles with seeded contradictions, fictional decks. Ingestion quality beats size.

## Evaluation criteria
| Criterion | Weight | Notes |
|---|---|---|
| Data Architecture & Intelligence | 30% | ingestion, dedup, enrichment, honest reasoning; MUST address cold-start |
| Investment Utility & Execution | 30% | actionable in 24h; speed from first signal to decision |
| Intelligent Analysis & Trust | 25% | Trust Scores surface evidence + uncertainty transparently |
| UX & Design | 15% | effortless + trustworthy for non-technical investor |

## Our positioning decisions (made, do not reopen without reason)
- Single-tenant build; multi-VC marketplace is the VISION framing in demo/README ("platform scans once, theses route founders to matching funds"), not a build item.
- Synthetic seed data includes: seeded contradictions (trust demo), cold-start founders (Q10 demo), one repeat founder across two companies (Founder Score persistence demo).
- CV upload feeds the cold-start footprint assessment ("weak GitHub ≠ invisible").
- Triage Mode (/triage swipe view) = mobile-styled route in the same app, framed as rapid review of overnight outbound discoveries — NOT a separate mobile application.
- Demo arc: outbound feed scan → ranked dealflow (axis disagreement visible) → contradiction catch → cold-start honesty → high-conviction memo + audio briefing → marketplace vision line.
