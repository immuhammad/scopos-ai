# Scopos — Feature Inventory

Single source of truth, generated from the actual code of both halves
(backend at repo root, frontend in `frontend/`). Statuses: **live** (real
data/AI), **simulated** (works, clearly no external effect), **demo-labeled**
(simulated and labeled as such in the UI). Rule references are the domain
rules in `CLAUDE.md` (1–8) and the challenge pillars (Sourcing → Screening →
Diligence → Decision; FAQ #10 cold-start).

## 1 · Sourcing (Identify → Activate)

| Feature | Where | Maps to | Status |
|---|---|---|---|
| Hacker News outbound scan (Show HN + Launch HN, last 30d, real Algolia API) creating **leads** — real founder + real post signals, Sourced stage, no claims/axes/memo | `POST /ingest/hn` · Sourcing page | Sourcing pillar; rule 6 (one funnel) | live |
| GitHub outbound scan (repos <30d, >50★, real API; org owners skipped) creating leads | `POST /ingest/github` | Sourcing pillar | live |
| Lead signal-strength breakdown — community traction, shipping consistency, account age, Founder Score, baseline; derived only from the real footprint | `GET /deals/{id}/outreach/draft` · Outreach pane | Sourcing pillar; rule 4 (no fabrication) | live |
| AI outreach email drafts (subject + body, references the specific project) | `GET /deals/{id}/outreach/draft` | Sourcing pillar; rule 7 | live |
| Simulated outreach send — status Discovered → Contacted → Invited, nothing leaves the system | `POST /deals/{id}/outreach/send` · `GET /deals/{id}/outreach/state` | Rule 7 (never auto-send) | demo-labeled |
| Convergence: "Simulate application received (demo)" builds an application from the lead's real public content and runs the FULL inbound pipeline on the same deal + founder | `POST /deals/{id}/simulate-application` · Outreach pane button | Rule 6 (one funnel), Identify→Activate→Converge | demo-labeled |
| Sourcing feed of every raw signal, source filter chips, load-more | `GET /sourcing` · `/feed` | Sourcing pillar | live |
| Coming-soon channels (arXiv, ProductHunt, Accelerators, Hackathons) — "One pipeline, many channels." | `/feed` chips | Roadmap framing | demo-labeled (disabled) |

## 2 · Screening

| Feature | Where | Maps to | Status |
|---|---|---|---|
| Public application portal — minimal by design (company + founder + deck), everything else optional | `POST /applications` · `/apply` (public route) | Screening pillar; "for ANY founder" | live |
| PDF deck + CV upload with server-side text extraction (pypdf → pdfminer fallback; a bad PDF never fails the application) | `POST /applications` (`deckFile`/`cvFile` base64) | Screening pillar | live |
| Tier-1 deterministic pre-screen — zero-LLM sanity gate before ANY model call: company/founder name sanity, minimal-content volume, keyboard-mash spam heuristics, 24h duplicate guard (same company slug + lead-founder email); junk stored non-viable with a model-free `prescreen` trace, no founder records, no quota spent | pipeline step `prescreen` in `POST /applications` | Screening pillar; quota-safe two-tier screening | live |
| Tier-2 LLM viability filter (genuine startup vs spam/joke) — runs only on applications that pass the free tier 1; non-viable stored, excluded from dealflow | pipeline step `filter` | Screening pillar | live |
| Founder dedup — one human = one record (email → GitHub handle → LinkedIn) | pipeline + `matchedFounderIds` | Rule 6 | live |
| Stepped pipeline-progress UI during the ~60–120s live run, then real per-step receipts | `/apply` | UX pillar | live |
| NL search — one LLM parse into criteria, deterministic scorer, full objects with match % / why / missing | `POST /search` · dashboard search bar | Investment-utility pillar | live |
| Thesis engine — saved theses, activation, risk appetite (Conservative/Balanced/Aggressive), ownership target %, **rule-gate Thesis Match** (sector/stage/geo/check-size/ownership/excluded/risk gates — the three axes never enter the formula) | `GET/POST /theses`, `GET /theses/active`, `POST /theses/{id}/activate` · thesis bar | Rule 1 (axes never averaged) | live |
| Triage swipe mode over Screening deals (shortlist / pass / request info) | `POST /deals/{id}/stage`, `POST /deals/{id}/star` · `/triage` | Investment utility (24h) | live |

## 3 · Diligence

| Feature | Where | Maps to | Status |
|---|---|---|---|
| Three INDEPENDENT axes — Founder (team-in-context 1–100), Market (Bullish/Neutral/Bear, **no numeric score**), Idea-vs-Market (1–100) — three concurrent gpt-4o calls, never combined | pipeline `axis-*` steps · deal Overview | Rule 1 | live |
| Founder Score ≠ Founder Axis — per-person persistent score with transparent components + history; one INPUT to the axis (labeled in UI) | founders pages · Team tab | Rule 2 | live |
| Cold-start footprint assessment — CV/writing specificity scored 0–30 with an explicit wider-uncertainty note | pipeline `cold-start` · deal header badge | FAQ #10; rule 5 | live |
| Quote-anchored claims — every claim carries the exact source sentence; code drops any claim whose quote isn't a ≥0.85 fuzzy match (no quote → no claim) | pipeline `extraction` · Receipts tab | Rule 4 | live |
| Per-claim Trust Score (0–100) + status; internal cross-artifact contradiction check requiring a verifiable quote; guards against self-quotes, rounding drift, and name-collision web evidence; Tavily external verification (verify-biased: web evidence contradicts only at ≥0.85 confidence + about-this-company attestation) | pipeline `trust:*` · Trust tab + claim sheet | Rule 3 | live |
| Investment memo — snapshot / hypotheses / SWOT / problem-product / traction; contradicted claims forced into risks; gaps read "Not disclosed" | `GET /deals/{id}/memo`, `POST /deals/{id}/memo/regenerate` · Memo tab | Rule 4; memo spec | live |
| Audio analyst briefing — chaptered ~150-word script + ElevenLabs TTS; **persisted** (survives refresh/navigation), real duration from the mp3 | `GET/POST /deals/{id}/briefing` · Overview player | Investment utility | live |
| Receipts / agentic traceability — every pipeline step recorded (model, summary, duration); artifacts list | `GET /deals/{id}/trace`, `GET /deals/{id}/artifacts` · Receipts tab | Analysis & trust pillar | live |
| Claim analyst notes | `POST /deals/{dealId}/claims/{claimId}/notes`, `GET /deals/{dealId}/claims/{claimId}` | Diligence pillar | live |
| High Upside · High Risk badge — explicit rule: Idea-vs-Market ≥ 65 AND Founder Axis < 50 (tooltip states it) | deal cards | Rule 1 (axis disagreement surfaced, not averaged) | live |

## 4 · Decision

| Feature | Where | Maps to | Status |
|---|---|---|---|
| Decision terminal — approve / approve-with-conditions / continue-diligence / decline; note REQUIRED; approvals labeled "Simulated investment decision" | `POST /deals/{id}/decide` · Decision tab | Rule 8; investment utility | demo-labeled |
| Decided deals leave the pending funnel automatically; status filter | `GET /deals?status=pending\|decided\|all` | Decision pillar | live |
| Decisions review & audit page — every DecisionRecord with note/conditions/actor, read-only detail (no portfolio-monitoring language) | `GET /deals/{id}/decisions` · `/decisions` | Decision pillar; out-of-scope guard | live |
| 24-hour deployment window countdown per deal | deal footer | Investment utility (24h) | live |
| Speed instrumentation — firstSignalAt / decidedAt / signal→decision hours + funnel metrics strip | `GET /metrics/summary` · dashboard hero | Investment utility | live |

## 5 · Memory

| Feature | Where | Maps to | Status |
|---|---|---|---|
| Founder Memory — every person ever seen, deduped across companies, score follows them (repeat-founder bonus, history events, never reset) | `GET /founders`, `GET /founders/{id}` · `/founders` | Rules 2 & 6 | live |
| Decline-feedback loop — decisions diverging from the pipeline's read stored as thesis-linked signals; last 5 injected into future axis+memo prompts ("weigh preferences, don't override evidence") | `POST /deals/{id}/decide` → `GET /theses/{id}/feedback` · Decision tab note | "Feeds back into Memory" | live |
| Append-only signal store — nothing discarded (applications, artifacts, posts, repos, feedback) | `signals` table · surfaced via feed + receipts | Data architecture pillar | live |
| Contact-status funnel per founder (Discovered → … → Funded/Passed) | `POST /founders/{id}/contact-status` | Sourcing pillar | live |

## 6 · Experience

| Feature | Where | Maps to | Status |
|---|---|---|---|
| Dashboard-as-loading-dock — metrics hero, two pipelines (Decision-Ready / Outreach), wishlist tab, recent activity | `/command` | UX pillar | live |
| Filters + pagination — deals (stage/sector/cold-start/high-signal), founders (status/score/flags), decisions, feed (source) | respective pages | UX pillar | live |
| Wishlist (star) with dedicated tab; Triage writes into it | `POST /deals/{id}/star` | UX pillar | live |
| Natural-language search bar with removable criteria chips | `/command` | UX pillar | live |
| Simulated partner auth — cookie session (7d), public `/` + `/apply`, protected app routes, sign-out; "any credentials work" labeled | `frontend/src/lib/auth.tsx` | Demo shell | demo-labeled |
| Mobile-responsive nav with active states + active-thesis chip | TopNav | UX pillar | live |
| Judge-facing captions throughout ("never averaged", "Not disclosed", simulated labels) | everywhere | Rules 1/4/8 | live |

## 7 · Platform

| Feature | Where | Maps to | Status |
|---|---|---|---|
| Contract-first API — backend conforms to the frontend `api.ts`; camelCase, exact enums, additive-only evolution | `app/schemas.py` | Team contract | live |
| Degrade-not-500 — every LLM call retries 2× then lands in the deal's `errors` field | `app/llm.py` | Robustness | live |
| Idempotent SQLite migrations at startup | `app/db.py` | Platform | live |
| Structured Outputs everywhere (Pydantic-validated LLM responses) | `app/llm.py` | Data architecture | live |
| E2E suite + manual walkthrough | `python -m tests.e2e_smoke` · `TESTING.md` | Verification | live |
| Monorepo — backend at root, frontend mirrored in `frontend/`, one-command re-sync | `scripts/sync-frontend.sh` | Submission | live |

## Not built (roadmap)

- Real authentication / user accounts (simulated cookie session only).
- Real outreach delivery (drafts + simulated sends only — by design, rule 7).
- arXiv / ProductHunt / accelerator / hackathon channels (disabled chips).
- Portfolio monitoring, follow-on, fund ops, exits — explicitly out of scope per the brief.
- Server-side pagination (client-side today; page params structured to move server-side).
- PDF parsing for scanned/image decks (text-layer PDFs only).
