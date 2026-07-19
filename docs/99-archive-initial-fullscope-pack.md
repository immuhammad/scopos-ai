# VC Brain — Full-Scope Build Context Pack (Solo Edition)
**Everything in. Nothing cut. Two mega-prompts + workflow.**

How to use this file:
1. **Part A** → paste into Claude Code (in Emdash, with Woz active) as the one-go backend build prompt.
2. **Part B** → paste into Lovable as the frontend prompt (fire this FIRST so it cooks while backend builds).
3. **Part C** → mock data file for Lovable (paste as second message to Lovable).
4. **Part D** → your personal run-order + smoke tests + demo script.

---
---

# PART A — CLAUDE CODE ONE-GO BACKEND PROMPT

Paste everything between the ==== lines into Claude Code as your first message in the repo directory.

====================================================================

You are building the complete backend for **VC Brain** — an AI-first venture capital operating system for the Hack-Nation Global AI Hackathon (Challenge 02, Maschmeyer Group). Build the ENTIRE backend described below in this session. Work through it module by module in the order given, and after building everything, run the SMOKE TEST CHECKLIST at the bottom and fix anything that fails before reporting done.

## PRODUCT CONTEXT (read carefully — design decisions depend on it)

VC Brain covers the pipeline **Sourcing → Screening → Diligence → Decision**:
- **Sourcing** has two doors that converge into ONE funnel: **Inbound** (founder applies with company name + deck text) and **Outbound** (system scans Hacker News and GitHub, discovers founders, scores them the same way as inbound, and generates personalized outreach drafts to convert them into applicants).
- **Screening** = (1) fast first-pass viability filter, then (2) THREE INDEPENDENT axis scores — Founder, Market, Idea-vs-Market — NEVER averaged into one number, each with trend and confidence, each citing evidence, all scored through a configurable fund thesis lens. A persistent per-person **Founder Score** (survives across companies, never resets) feeds the Founder axis as one input but is NOT a substitute for it.
- **Diligence** = truth-gap check: every extracted claim gets a per-claim **Trust Score** — first an internal cross-artifact contradiction check, then external verification via Tavily web search. Status: verified | unverified | contradicted. Unverified is NORMAL for early startups, not damning.
- **Decision** = evidence-backed investment memo. Required sections: company_snapshot, investment_hypotheses, swot, problem_and_product, traction_and_kpis. Every factual statement references a claim/signal id. Missing data (cap table, financials, customer references) is written EXACTLY as "Not disclosed" — never invented. Contradicted claims MUST surface in swot.risks. Plus a final recommendation block: invest_100k | pass | needs_human_review, with reasoning.
- **Cold-start founders** (no GitHub, no funding, no launches) are a FIRST-CLASS case: score them from public footprint (writing specificity, domain insight, any small shipped artifact) with an explicit wider-uncertainty label. Never inflate.
- **Conviction threshold**: any opportunity with founder axis >= 8 AND zero contradicted claims is auto-flagged `high_conviction=true` (surfaces "outreach recommended" / "fast-track decision").
- **Memory rule**: nothing is ever discarded. All raw payloads stored, timestamped, source-tagged. Signals table is append-only.

## STACK (no substitutions)
- Python 3.11+, FastAPI + Uvicorn, SQLAlchemy 2.x ORM, SQLite (`sqlite:///./vcbrain.db`)
- OpenAI Python SDK >= 1.30 — `gpt-4o` for axis scoring, memos, cold-start assessment; `gpt-4o-mini` for extraction, first-pass filter, trust classification, synthetic data, outreach drafts. ALL calls use Structured Outputs (`client.beta.chat.completions.parse` with Pydantic models). Temperature 0.2 everywhere except synthetic generation (0.8).
- `tavily-python` for external verification. `httpx` for HN/GitHub. `python-dotenv`.
- ElevenLabs via plain httpx POST (text-to-speech endpoint) — one service function, graceful skip if no key.
- Retry wrapper on every external call: 2 retries, exponential backoff, log-and-continue on final failure (an LLM failure must NEVER 500 the API — return partial results with an `errors[]` field).

## ENV (.env — create .env.example with these keys)
OPENAI_API_KEY, TAVILY_API_KEY, GITHUB_TOKEN, ELEVENLABS_API_KEY (optional), DATABASE_URL=sqlite:///./vcbrain.db, CORS_ORIGINS (comma-separated; default `*` for hackathon)

## REPO STRUCTURE
```
app/
  main.py            # FastAPI app, CORS from env, routers, startup: create tables
  db.py              # engine, SessionLocal, get_db dependency
  models.py          # ORM models (schema below)
  schemas.py         # ALL Pydantic models: requests, responses, LLM structured outputs
  routers/
    founders.py      # list/detail/apply
    scoring.py       # score endpoints
    verify.py        # trust endpoints
    memo.py          # memo + audio briefing
    theses.py        # thesis CRUD
    signals.py       # sourcing feed + ingestion triggers
  services/
    llm.py           # OpenAI wrapper: one client, parse-based structured calls, retry
    ingest_hn.py     # HN Algolia ingestion
    ingest_github.py # GitHub enrichment
    dedupe.py        # identity resolution + merge
    founder_score.py # persistent score calc
    filter.py        # first-pass viability
    extract.py       # claim extraction
    axes.py          # 3-axis scoring (3 independent calls, asyncio.gather)
    coldstart.py     # footprint assessment
    trust.py         # internal contradiction check + Tavily external
    memo.py          # memo assembly + caching
    outreach.py      # personalized outreach draft generation
    briefing.py      # ElevenLabs audio briefing (graceful no-op without key)
  seed/
    generate_synthetic.py  # CLI: python -m app.seed.generate_synthetic
```
Plus: requirements.txt, .env.example, .gitignore (must include .env, *.db, __pycache__), render.yaml (uvicorn app.main:app --host 0.0.0.0 --port $PORT), README.md stub.

## DATABASE SCHEMA (SQLAlchemy models — exact fields)

**founders**: id PK, canonical_name (req), github_handle, hn_username, primary_url, email, location, is_cold_start bool default False, status text default 'discovered' (discovered | outreach_ready | applied | screened | decided), created_at, updated_at

**signals** (append-only, never update/delete): id PK, founder_id FK, source (hn | github | inbound_application | synthetic), signal_type (show_hn_post | repo | commit_activity | application | deck_text | artifact), raw_json text (full original payload), fetched_at

**claims**: id PK, founder_id FK, company_name, claim_text, claim_category (traction | revenue | team | market | tech), source_signal_id FK, trust_status default 'unverified' (verified | unverified | contradicted), trust_confidence float, verification_evidence text (summary + URL or internal-contradiction explanation), verified_at

**axis_scores** (new row per re-score — history is the trend source): id PK, founder_id FK, company_name, axis (founder | market | idea_vs_market), score int 1-10, trend (improving | stable | declining), confidence (high | medium | low), evidence_json (list of {quote, signal_id}), reasoning text, scored_at

**founder_scores** (one row per person, UPDATED never reset): founder_id PK/FK, score float 0-100, components_json (transparent breakdown), updated_at

**theses**: id PK, name, sectors_json, stage, geographies_json, check_size_usd default 100000, risk_appetite (conservative | balanced | aggressive), created_at. Seed ONE default thesis on startup: "AI Infra Europe Pre-Seed" (sectors ["AI infrastructure","developer tools"], stage pre-seed, geographies ["Europe"], balanced).

**memos**: id PK, founder_id FK, thesis_id FK, company_name, memo_json, recommendation (invest_100k | pass | needs_human_review), high_conviction bool, audio_path nullable, generated_at

**outreach_drafts**: id PK, founder_id FK, draft_text, generated_at

## FOUNDER SCORE FORMULA (services/founder_score.py — transparent, stored in components_json)
```
score = min(100,
    15 * shipped_projects        # repos >5 stars OR launched products (count, cap 3)
  + 10 * launches                # Show HN / Launch HN posts (count, cap 3)
  + min(20, 0.1 * community)     # HN points + GitHub stars total
  + consistency                  # 0-10: commit activity spread over >6 months
  + 15 * prior_company_bonus     # 1 if a DIFFERENT company_name already scored in axis_scores for this founder
  + footprint_score )            # 0-30 from cold-start assessment (0 if not cold-start)
```
Recompute on every new signal AND after cold-start assessment. Never delete the row.

## PIPELINES (wire these exact flows)

**INBOUND**: POST /founders/apply {founder_name, company_name, deck_text, links[]} →
1. dedupe.resolve(): match on github_handle / hn_username / primary_url extracted from links; merge into existing founder (status→'applied', Founder Score CARRIES OVER) or create new
2. store application as signal (source='inbound_application')
3. filter.first_pass() (gpt-4o-mini): viable bool + reason. Non-viable → store, mark, STOP (still visible in DB, never scored)
4. extract.claims() (gpt-4o-mini) → claims rows
5. If any GitHub link → ingest_github.enrich() → more signals
6. If founder has NO track-record signals (no repos, no launches) → coldstart.assess() (gpt-4o) → footprint_score + uncertainty_note, set is_cold_start=True
7. founder_score.recompute()
8. axes.score_all() (3 × gpt-4o via asyncio.gather, thesis lens passed in, Founder Score passed into founder-axis prompt as one input) → axis_scores rows; trend = compare vs previous rows for same founder+company, else 'stable'
9. trust.run(): internal cross-artifact contradiction check FIRST (gpt-4o-mini compares each claim against the founder's OTHER signals/artifacts) → then Tavily external for claims still unverified (search company_name + claim keywords, classify with gpt-4o-mini). Update claims rows.
10. Set high_conviction flag. Return full profile JSON.

**OUTBOUND**: POST /signals/ingest/hn?days=30&limit=50 →
- HN Algolia: GET https://hn.algolia.com/api/v1/search_by_date?tags=show_hn&numericFilters=created_at_i>{cutoff} (also run query for "Launch HN" in title). Store each post as signal. For each author: dedupe.resolve → founder row (status 'discovered'), extract any GitHub/website links from post text → enrich via GitHub API (repos, stars, account created_at, recent commit activity via events endpoint; skip gracefully on 403/rate-limit). Then run steps 3-10 of the inbound pipeline on the founder (same code path — one funnel). Then outreach.draft() (gpt-4o-mini): 4-6 sentence personalized draft referencing their SPECIFIC project and why it fits the active thesis; status→'outreach_ready'. NEVER send email — drafts only.
- POST /signals/ingest/github_trending (optional second channel): scrape-free approach — GitHub search API `q=created:>{30d ago} stars:>50`, top 20 repos, owners → same founder pipeline.

## LLM PROMPTS (implement in services/, structured outputs, these exact behaviors)

**First-pass filter (mini)**: "Is this a genuine startup/project by a real person, or spam/joke/empty/incoherent? Lean permissive — only reject clear junk." → {viable: bool, reason: str}

**Claim extraction (mini)**: "Extract every factual claim (assertions that could be true or false): revenue, users, traction, team, technology, market size, partnerships. One item each. Do NOT evaluate." → list[{claim_text, claim_category}]

**Axis scoring (gpt-4o, ONE CALL PER AXIS, never combined)**: system prompt per axis:
- founder: "who they are — traits, track record, evidence of shipping and resilience. The persistent Founder Score {X}/100 with breakdown {components} is ONE input — weigh it with current evidence, do not just restate it."
- market: "sizing, competition, timing. Include bullish|neutral|bear rating in reasoning."
- idea_vs_market: "does the idea survive scrutiny as-is, or is the team strong enough to pivot?"
Common rules: "Score ONLY your axis, 1-10. Cite evidence as exact quotes with signal_id. Thin evidence → lower confidence, never invent. Thesis is context, not rubric: {thesis_json}." → {score, trend_hint, confidence, evidence:[{quote, signal_id}], reasoning}

**Cold-start (gpt-4o)**: "No conventional track record. Assess ONLY from public footprint: writing specificity, domain expertise, concrete problem understanding, any small shipped artifact. WIDER UNCERTAINTY than track-record assessment — say so. Generic application scores low; specific, technical, unusual insight scores high. Never inflate." → {footprint_score: 0-30, uncertainty_note, evidence:[{quote, signal_id}]}

**Internal contradiction (mini)**: "Compare this claim against the founder's other artifacts below. Does anything contradict it?" → {contradicted: bool, explanation, contradicting_quote|null}

**Tavily classification (mini)**: given claim + tavily.search(query, max_results=5) results: → {trust_status: verified|contradicted|unverified, trust_confidence: 0-1, evidence_summary, source_url|null}. "Unverified is normal for early startups."

**Memo (gpt-4o)**: sections company_snapshot, investment_hypotheses, swot{strengths,weaknesses,opportunities,risks}, problem_and_product, traction_and_kpis, plus recommendation {decision: invest_100k|pass|needs_human_review, reasoning}. Rules: every factual statement carries [claim:N] or [signal:N] reference; contradicted claims MUST appear in swot.risks with the contradiction; missing standard data → exactly "Not disclosed"; "as detailed as the decision requires, as brief as clarity allows" — no padding. Cache in memos table; regenerate only with ?force=true.

**Outreach draft (mini)**: "Personalized outreach 4-6 sentences: reference their SPECIFIC project by name and what impressed the system, why it fits thesis {thesis}, invite them to apply. No generic flattery."

**Briefing script (mini) + ElevenLabs**: condense memo to ~150-word spoken script (snapshot, the three axis scores AND their disagreement if any, top verified + any contradicted claim, recommendation) → POST to ElevenLabs TTS (voice: default "Rachel" or first available), save mp3 to ./audio/{memo_id}.mp3, store path. If ELEVENLABS_API_KEY missing → return {audio: null, note: "TTS not configured"} without error.

## API ENDPOINTS (exact routes — a Lovable frontend is built against these names)
```
GET  /health → {"status":"ok"}
GET  /theses            POST /theses
GET  /founders?thesis_id=&sort=founder_axis  → ranked list, each item:
     {id, canonical_name, company_name, status, is_cold_start, high_conviction,
      founder_score, axes:{founder:{score,trend,confidence}, market:{...}, idea_vs_market:{...}},
      trust_summary:{verified,unverified,contradicted}}
     Ranking: high_conviction first, then founder axis desc, tie-break founder_score. NEVER return an averaged single score.
GET  /founders/{id}     → full profile: signals, claims (with trust), axis history, founder_score components, uncertainty_note if cold-start, outreach draft if any
POST /founders/apply    → runs full inbound pipeline, returns profile
POST /founders/{id}/score?thesis_id=   → re-run axes
POST /founders/{id}/verify             → re-run trust pipeline
GET  /founders/{id}/memo?thesis_id=&force=false → memo JSON
POST /founders/{id}/memo/briefing      → generate audio, return {audio_url}
GET  /audio/{filename}                 → serve mp3 (StaticFiles mount)
GET  /founders/{id}/outreach           → outreach draft
POST /signals/ingest/hn?days=30&limit=50
POST /signals/ingest/github_trending
GET  /signals/feed?limit=50            → latest signals desc, {id, founder_name, source, signal_type, summary (first 140 chars of payload), fetched_at}
```

## SYNTHETIC SEED DATA (app/seed/generate_synthetic.py)
CLI script using gpt-4o-mini (temp 0.8) generating 20 profiles, then POSTing each through /founders/apply (NOT direct DB insert — must exercise the real pipeline):
- 12 normal credible profiles, varied sectors/geographies, some matching the default thesis and some not
- 4 with SEEDED CONTRADICTIONS: application claims X ("$500K ARR", "team of 12", "patent granted", "10k users") while an attached artifact (website copy / bio / changelog) contradicts it ("join our beta waitlist", "solo founder", "patent pending", "127 signups"). Artifacts go in as additional signals so the internal contradiction check can catch them. Keep a `_seeded` note in the script output (NOT in the DB) listing which profiles contain which contradictions, for demo reference.
- 3 COLD-START: no GitHub, no funding, no launches — application text only (one clearly brilliant and specific, one mediocre generic, one mid). 
- 1 REPEAT FOUNDER: generate TWO applications for the same person (same name/handle) with two DIFFERENT companies — submit the first, then the second — to demo Founder Score persistence and the prior_company_bonus.

## SMOKE TEST CHECKLIST (run ALL before reporting done — fix failures)
1. `uvicorn app.main:app` boots; GET /health = 200
2. POST /founders/apply with a minimal profile → 200, founder created, claims extracted, 3 axis_scores rows (three DIFFERENT axis values present), founder_scores row exists
3. Seed script runs end-to-end: 20 profiles + 1 repeat → DB has 21 founders (repeat MERGED, not duplicated — verify count)
4. At least one seeded-contradiction profile has a claim with trust_status='contradicted' and verification_evidence populated
5. Cold-start profile: is_cold_start=True, uncertainty_note present, footprint_score in founder_score components
6. Repeat founder: second company's founder-axis evidence/reasoning references prior history; components_json shows prior_company_bonus=15
7. GET /founders returns ranked list, no averaged score anywhere in payload
8. GET /founders/{id}/memo → all 5 sections + recommendation; a contradicted claim appears in swot.risks; at least one "Not disclosed" present
9. POST /signals/ingest/hn (if network available) → signals created; if network fails, endpoint returns a clean error JSON, not a 500
10. GET /signals/feed returns rows
11. Every LLM-failure path: temporarily set a bad OPENAI_API_KEY and confirm /founders/apply returns a structured error, not a crash. Restore key.
12. grep repo for the API keys — .env not committed, .gitignore correct

Build everything. Commit per module with clear messages. Report at the end: what passed, what you fixed, anything still flaky.

====================================================================

---
---

# PART B — LOVABLE FRONTEND PROMPT

Fire this FIRST (before backend). Paste as one message, then paste PART C as the follow-up message.

====================================================================

Build "VC Brain" — an AI venture-capital operating dashboard for a solo investor. Style: Notion-level approachability with Bloomberg-level analytical density. Clean, light, data-dense, generous whitespace, no gradients or glassmorphism. Sans-serif. This is a serious financial tool, not a landing page.

It consumes a REST API (base URL configurable in a single constants file — start with MOCK MODE using the mock data I'll paste next, structured exactly like the real API responses; I will swap the base URL later, so route ALL data access through one api.ts client module with a USE_MOCKS flag).

## Views

**1. Dashboard (/)** — main screen, two zones:
- Left sidebar: FUND THESIS panel — editable form: name, sectors (multi-select chips: AI infrastructure, developer tools, healthcare AI, fintech, climate, consumer), stage (pre-seed/seed), geographies (multi-select: Europe, North America, India, Global), check size (default $100,000), risk appetite (conservative/balanced/aggressive segmented control). "Apply Thesis" button re-fetches the ranked list. Below it: a compact "New Application" button opening a modal with founder_name, company_name, deck_text (textarea), links (repeatable input) → POST /founders/apply.
- Main zone: RANKED FOUNDER LIST. Each card: founder name + company, status pill (discovered/outreach_ready/applied/screened), HIGH CONVICTION gold badge when high_conviction=true, COLD-START amber badge when is_cold_start=true, persistent Founder Score as small circular gauge (0-100), and THREE SEPARATE axis badges side by side — Founder, Market, Idea↔Market — each showing score/10 + tiny trend arrow (↑ improving, → stable, ↓ declining) + confidence dot (green high / yellow medium / grey low). CRITICAL RULE: never combine the three axes into a single number anywhere in the UI — the disagreement between axes is the product. Trust summary chips on each card: ✓ n verified (green), ○ n unverified (grey), ⚠ n contradicted (red). Cards with contradicted > 0 get a subtle red left border.

**2. Founder Detail (/founder/:id)** — four stacked sections:
- Header: name, company, status, badges, Founder Score gauge WITH breakdown popover (shipped projects, launches, community, consistency, prior-company bonus, footprint) from components_json. If cold-start: prominent amber callout showing the uncertainty_note verbatim.
- AXES: three columns, one per axis — big score, trend, confidence, reasoning paragraph, and an evidence list of quoted snippets each tagged [signal:N]. 
- CLAIMS & TRUST: table of every claim — claim text, category chip, trust status (green ✓ verified with source link / grey ○ unverified with "normal for early stage" tooltip / red ⚠ CONTRADICTED), and for contradicted ones an expandable row showing the verification_evidence (the contradicting quote or URL). This red row is the hero moment of the product — make it unmissable.
- MEMO: rendered from memo_json — the five sections (Company Snapshot, Investment Hypotheses, SWOT as 2×2 grid, Problem & Product, Traction & KPIs), inline [claim:N]/[signal:N] references as small superscript tags, "Not disclosed" values styled as dashed-underline muted text (visible honesty, not hidden). Top-right: RECOMMENDATION banner — invest_100k (green "INVEST $100K"), needs_human_review (amber), pass (grey). Buttons: "Generate Memo" (if none), "▶ Play Analyst Briefing" (calls POST /founders/:id/memo/briefing then plays returned audio_url in an inline player; hide button gracefully if audio null), and for outreach_ready founders an "Outreach Draft" drawer showing draft_text with a copy button.

**3. Sourcing Feed (/feed)** — live signal stream: table of latest signals — time, source tag (HN orange / GitHub dark / inbound blue / synthetic purple), founder name (links to detail), type, summary snippet. Header buttons: "Scan Hacker News" → POST /signals/ingest/hn, "Scan GitHub Trending" → POST /signals/ingest/github_trending, with loading states and result toast ("14 new signals · 6 new founders").

Top nav: VC Brain wordmark, Dashboard / Sourcing Feed links, thesis name currently active.

## API shapes
Exactly the mock data structure I paste next. Endpoints: GET /founders?thesis_id=, GET /founders/:id, POST /founders/apply, GET /founders/:id/memo, POST /founders/:id/memo/briefing, GET /founders/:id/outreach, GET /signals/feed, GET/POST /theses, POST /signals/ingest/hn, POST /signals/ingest/github_trending. Handle loading and error states on every fetch (skeleton cards, toast on error). CORS-friendly plain fetch.

====================================================================

---
---

# PART C — MOCK DATA FOR LOVABLE (paste as second message)

"Here is the mock data — put it in src/mocks.ts and wire MOCK MODE to serve it:"

```json
{
  "theses": [{"id":1,"name":"AI Infra Europe Pre-Seed","sectors_json":["AI infrastructure","developer tools"],"stage":"pre-seed","geographies_json":["Europe"],"check_size_usd":100000,"risk_appetite":"balanced"}],
  "founders_list": [
    {"id":1,"canonical_name":"Elena Vasquez","company_name":"TensorGate","status":"applied","is_cold_start":false,"high_conviction":true,"founder_score":74,"axes":{"founder":{"score":9,"trend":"improving","confidence":"high"},"market":{"score":7,"trend":"stable","confidence":"medium"},"idea_vs_market":{"score":8,"trend":"stable","confidence":"high"}},"trust_summary":{"verified":3,"unverified":2,"contradicted":0}},
    {"id":2,"canonical_name":"Marcus Webb","company_name":"FlowMetrics","status":"applied","is_cold_start":false,"high_conviction":false,"founder_score":41,"axes":{"founder":{"score":6,"trend":"stable","confidence":"medium"},"market":{"score":8,"trend":"improving","confidence":"medium"},"idea_vs_market":{"score":4,"trend":"declining","confidence":"high"}},"trust_summary":{"verified":1,"unverified":3,"contradicted":2}},
    {"id":3,"canonical_name":"Priya Sharma","company_name":"CarbonLedger","status":"applied","is_cold_start":true,"high_conviction":false,"founder_score":22,"axes":{"founder":{"score":5,"trend":"stable","confidence":"low"},"market":{"score":7,"trend":"stable","confidence":"medium"},"idea_vs_market":{"score":6,"trend":"stable","confidence":"low"}},"trust_summary":{"verified":0,"unverified":4,"contradicted":0}},
    {"id":4,"canonical_name":"Jonas Keller","company_name":"PipeWrench","status":"outreach_ready","is_cold_start":false,"high_conviction":false,"founder_score":58,"axes":{"founder":{"score":7,"trend":"improving","confidence":"high"},"market":{"score":5,"trend":"stable","confidence":"medium"},"idea_vs_market":{"score":6,"trend":"stable","confidence":"medium"}},"trust_summary":{"verified":2,"unverified":1,"contradicted":0}}
  ],
  "founder_detail_2": {
    "id":2,"canonical_name":"Marcus Webb","company_name":"FlowMetrics","status":"applied","is_cold_start":false,"high_conviction":false,
    "founder_score":41,"founder_score_components":{"shipped_projects":15,"launches":10,"community":6,"consistency":5,"prior_company_bonus":0,"footprint_score":0},
    "uncertainty_note":null,
    "axes_history":[{"axis":"founder","score":6,"trend":"stable","confidence":"medium","reasoning":"Solid engineering background with one shipped analytics tool, but limited evidence of resilience under adversity.","evidence":[{"quote":"built and launched DataPipe (340 GitHub stars)","signal_id":11}]},{"axis":"market","score":8,"trend":"improving","confidence":"medium","reasoning":"Product analytics for mid-market is large and underserved; bullish.","evidence":[{"quote":"targeting the 40k mid-market SaaS companies priced out of Amplitude","signal_id":12}]},{"axis":"idea_vs_market","score":4,"trend":"declining","confidence":"high","reasoning":"Current positioning collides with entrenched incumbents; team may need to pivot to a vertical wedge.","evidence":[{"quote":"we will win on price against Mixpanel and Amplitude","signal_id":12}]}],
    "claims":[
      {"id":21,"claim_text":"FlowMetrics has $500K ARR","claim_category":"revenue","trust_status":"contradicted","trust_confidence":0.9,"verification_evidence":"INTERNAL CONTRADICTION — company website artifact states: 'Join our beta waitlist — launching Q3'. A pre-launch product cannot have $500K ARR."},
      {"id":22,"claim_text":"Team of 12 engineers","claim_category":"team","trust_status":"contradicted","trust_confidence":0.85,"verification_evidence":"INTERNAL CONTRADICTION — founder bio artifact states: 'solo technical founder, hiring my first engineer soon'."},
      {"id":23,"claim_text":"Founder previously built DataPipe (340 GitHub stars)","claim_category":"team","trust_status":"verified","trust_confidence":0.95,"verification_evidence":"GitHub repo confirmed via API: marcuswebb/datapipe, 340 stars. https://github.com/example"},
      {"id":24,"claim_text":"Product analytics market worth $14B by 2027","claim_category":"market","trust_status":"unverified","trust_confidence":0.4,"verification_evidence":"No independent source found in search — normal for market projections."}
    ],
    "signals":[{"id":11,"source":"github","signal_type":"repo","summary":"marcuswebb/datapipe — product analytics ETL, 340 stars","fetched_at":"2026-07-18T20:11:00Z"},{"id":12,"source":"inbound_application","signal_type":"application","summary":"FlowMetrics application: mid-market product analytics...","fetched_at":"2026-07-18T21:02:00Z"}],
    "outreach_draft":null
  },
  "memo_2": {
    "recommendation":{"decision":"needs_human_review","reasoning":"Strong market and a verified technical founder, but two contradicted core claims (revenue, team size) destroy trust in the application as submitted. Recommend a founder call before any decision."},
    "company_snapshot":"FlowMetrics targets mid-market SaaS companies priced out of enterprise product analytics [signal:12]. The founder previously shipped DataPipe, a related open-source ETL tool with meaningful adoption [claim:23]. Stage: pre-launch [claim:21 contradiction].",
    "investment_hypotheses":["Technical founder with proven shipping ability in the exact problem domain [claim:23]","Large underserved mid-market segment [claim:24]","Wedge unclear against incumbents — pivot capacity is the bet [signal:12]"],
    "swot":{"strengths":["Verified prior open-source traction [claim:23]"],"weaknesses":["Head-on pricing battle with entrenched incumbents [signal:12]"],"opportunities":["Vertical-specific analytics wedge"],"risks":["CONTRADICTED: claimed $500K ARR vs 'beta waitlist' on own site [claim:21]","CONTRADICTED: claimed team of 12 vs 'solo founder' bio [claim:22]"]},
    "problem_and_product":"Mid-market SaaS teams cannot afford enterprise analytics; FlowMetrics offers usage-based pricing on a lighter pipeline [signal:12].",
    "traction_and_kpis":"Revenue: contradicted, treat as $0 [claim:21]. Users: Not disclosed. Growth: Not disclosed. Unit economics: Not disclosed.",
    "audio_url":null
  },
  "signals_feed":[
    {"id":31,"founder_name":"Jonas Keller","founder_id":4,"source":"hn","signal_type":"show_hn_post","summary":"Show HN: PipeWrench — zero-config CI caching (214 points)","fetched_at":"2026-07-18T22:40:00Z"},
    {"id":32,"founder_name":"Elena Vasquez","founder_id":1,"source":"github","signal_type":"repo","summary":"tensorgate/runtime — GPU scheduling runtime, 1.2k stars","fetched_at":"2026-07-18T22:15:00Z"},
    {"id":33,"founder_name":"Priya Sharma","founder_id":3,"source":"inbound_application","signal_type":"application","summary":"CarbonLedger application: carbon accounting for EU CSRD...","fetched_at":"2026-07-18T21:55:00Z"}
  ],
  "outreach_draft_4":{"draft_text":"Hi Jonas — your Show HN launch of PipeWrench caught our system's attention: 214 points and a genuinely novel take on CI caching that fits our AI-infrastructure thesis. The zero-config approach suggests exactly the product instinct we back at pre-seed. We deploy $100K decisions within 24 hours of a completed application — no warm intro needed. If you're open to it, apply here and you'll have an answer tomorrow."}
}
```

Note the mock IDs: founder 2 (Marcus Webb) is the CONTRADICTION demo, founder 3 (Priya) is the COLD-START demo, founder 1 (Elena) is the HIGH-CONVICTION demo, founder 4 (Jonas) is the OUTBOUND/outreach demo. The real backend will produce the same shapes.

---
---

# PART D — YOUR RUN ORDER, SWAP, AND DEMO

## Run order
1. **Now:** Fire Part B into Lovable, then Part C. Let it cook. Max 3 correction rounds, 15 min each.
2. **Now + 10 min:** `mkdir vc-brain && cd vc-brain && git init`, create GitHub repo, open Emdash → Claude Code session in the repo (Woz active). Paste Part A. Let it build. Answer its questions fast; don't redesign mid-flight.
3. **While Claude Code builds:** get keys ready — OpenAI credit code, Tavily shared code (from the partner page), GitHub PAT (Settings → Developer settings → tokens, public repo read), ElevenLabs if approved. Fill `.env`.
4. **When Part A reports smoke tests passed:** run seed script → 21 founders in DB. Deploy to Render (connect repo, add env vars, note the URL).
5. **Swap:** in Lovable, one instruction: "Set USE_MOCKS=false and API base URL to https://YOUR-APP.onrender.com". Click through all three views against real data. Fix field mismatches by telling Lovable the exact real JSON (paste a real response).
6. **Pre-demo:** hit /founders/{id}/memo for every demo founder (cache warm), generate ElevenLabs briefing for one, hit /health 2 min before demo (Render cold start).
7. **Record backup video. Then submit: repo + live Lovable URL.**

## Demo script (60s)
1. Sourcing Feed → click "Scan Hacker News" live → new signals appear. "Outbound sourcing: founders who never applied, scored like applicants, outreach drafted." Show Jonas's outreach draft.
2. Dashboard → thesis panel → ranked list. "Three independent axes — never averaged. The disagreement IS the signal." Point at Marcus: Market 8, Idea 4.
3. Marcus detail → red contradicted rows: "$500K ARR vs their own beta waitlist. Caught before it reached the investor." Memo shows needs_human_review with contradictions in risks.
4. Priya detail → cold-start callout: "No track record — scored on footprint, uncertainty stated, not hidden."
5. Elena detail → high-conviction badge → memo INVEST $100K → play the ElevenLabs analyst briefing over your closing line: "A fund that finds founders nobody else sees — and tells you exactly how sure it is."

## If something breaks late (fallback ladder)
- Lovable↔API mismatch unfixable → demo Lovable in MOCK MODE (it's the same shapes) + show the real API responses in a terminal/Swagger side-by-side. Honest and still complete.
- Render down → `uvicorn` locally + ngrok, update Lovable base URL.
- ElevenLabs not approved → skip step 5 audio; nothing else depends on it.
