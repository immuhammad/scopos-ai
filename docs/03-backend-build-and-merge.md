# VC Brain Backend — Kickoff Guide (Contract-Conformant Edition)

The frontend's `src/lib/api.ts` + `src/lib/mocks.ts` are now THE CONTRACT. The backend conforms to the frontend — not the other way around. This document contains: (1) manual setup steps, (2) the one-go Claude Code build prompt rewritten to match the frontend types field-for-field, (3) deployment, (4) the merge procedure.

---

## STEP 1 — Manual setup (you, ~20 minutes, before any AI)

```bash
# 1. Create the repo
mkdir vc-brain-api && cd vc-brain-api
git init
gh repo create vc-brain-api --private --source=. --push   # or create on github.com and add remote

# 2. Copy the CONTRACT files from the frontend repo into a contract/ folder
mkdir contract
cp ../venture-mind-os/src/lib/api.ts contract/
cp ../venture-mind-os/src/lib/mocks.ts contract/
# These are reference-only — Claude Code will read them to match shapes exactly.

# 3. Python env
python3.11 -m venv .venv && source .venv/bin/activate

# 4. Keys file
cat > .env << 'EOF'
OPENAI_API_KEY=sk-...          # from your credit code
TAVILY_API_KEY=tvly-...        # shared code from the partner page
GITHUB_TOKEN=ghp_...           # PAT, public repo read scope
ELEVENLABS_API_KEY=            # optional, leave empty if not approved
DATABASE_URL=sqlite:///./vcbrain.db
CORS_ORIGINS=https://venture-mind-os.lovable.app,http://localhost:3000,http://localhost:5173
EOF

echo -e ".env\n*.db\n__pycache__/\n.venv/\naudio/" > .gitignore
git add . && git commit -m "chore: repo init with contract reference"

# 5. Open Emdash → new Claude Code session in this directory (Woz active)
#    Paste STEP 2 below as the first message.
```

---

## STEP 2 — The one-go Claude Code prompt (paste everything between ==== lines)

====================================================================

You are building the complete FastAPI backend for **VC Brain**, an AI-first VC operating system (Hack-Nation Challenge 02). A finished React frontend already exists; its API client and mock data are in `contract/api.ts` and `contract/mocks.ts` in this repo. **READ BOTH FILES FIRST.** Your backend must reproduce their exact function surface and JSON shapes so the frontend can switch from mocks to this API by changing one flag. After building everything, run the SMOKE TESTS at the bottom and fix failures before reporting done.

## NON-NEGOTIABLE CONTRACT RULES
1. **JSON field names are camelCase**, exactly as in `contract/mocks.ts` (`founderScore`, `pipelineStage`, `isColdStart`, `founderAxis`, `ideaVsMarket`, `teamCoverage`, `askUsd`, `decisionDeadline`, `contactStatus`, `contradictionCount`, `scoreTrend`, `timeInStageHours`, `nextAction`, `founderIds`, `reviewNotes`, `trustScore`). Use Pydantic models with `alias_generator=to_camel` and `populate_by_name=True`, or explicit camelCase field names. Snake_case in responses breaks the frontend.
2. **Enums match the frontend exactly:** Trend = `"up" | "flat" | "down"` (NOT improving/stable/declining). MarketRating = `"Bullish" | "Neutral" | "Bear"`. ClaimStatus = `"verified" | "unverified" | "contradicted"`. ContactStatus, PipelineStage, SourceType, CoverageRating: copy the literal unions from `contract/mocks.ts` verbatim.
3. **The market axis has no numeric score** in the contract — it has `rating` (Bullish/Neutral/Bear) + `trend` + `tam` + `summary` + `competitors[]`. Founder axis and ideaVsMarket have numeric `score`. Follow the contract, not generic instinct.
4. Deal `links[].href` is `string | null` — null when not provided, never "#".
5. IDs are strings (slugs like "helix", "amara-okafor"). Generate new ones as kebab-case slugs.

## STACK
Python 3.11, FastAPI + Uvicorn, SQLAlchemy 2.x on SQLite, OpenAI SDK >=1.30 (gpt-4o for axis scoring / memos / cold-start; gpt-4o-mini for extraction / filtering / trust classification / synthetic data / outreach / NL-search parsing; ALL calls via Structured Outputs `client.beta.chat.completions.parse` with Pydantic; temp 0.2, synthetic 0.8), tavily-python, httpx, python-dotenv. Retry wrapper: 2 retries exponential backoff; an LLM failure must NEVER 500 an endpoint — degrade with an `errors` field. ElevenLabs TTS via httpx POST; graceful no-op if key missing. CORS from CORS_ORIGINS env (comma-separated). Mount StaticFiles at /audio.

## ENDPOINTS — mirror contract/api.ts one-to-one
```
api.ts function                → REST endpoint
listDeals()                    → GET  /deals            (ranked: starred/high-signal first, then founderAxis.score desc; NEVER an averaged single score anywhere)
getDeal(id)                    → GET  /deals/{id}
starDeal(id, starred)          → POST /deals/{id}/star        {starred: bool}
decideDeal(id, decision, note) → POST /deals/{id}/decide      {decision: "approve"|"approve_with_conditions"|"continue_diligence"|"decline", note: str (required), conditions?: str}
                                 → updates pipelineStage, appends to an auditTrail array on the deal (decision, note, conditions, timestamp)
listFounders()                 → GET  /founders
getFounder(id)                 → GET  /founders/{id}
setFounderContactStatus(...)   → POST /founders/{id}/contact-status  {status}
listSourcing()                 → GET  /sourcing
getClaim(dealId, claimId)      → GET  /deals/{dealId}/claims/{claimId}
addClaimNote(...)              → POST /deals/{dealId}/claims/{claimId}/notes  {note}
submitApplication(payload)     → POST /applications      (payload exactly as in contract/api.ts: company, tagline?, sector?, stage?, geography?, founders[{name,role,email,linkedin?,github?}], links[], hasDeck; ALSO accept optional cvText and videoPitchUrl)
getMemo(dealId)                → GET  /deals/{id}/memo
regenerateMemo(dealId)         → POST /deals/{id}/memo/regenerate
generateBriefing(dealId)       → POST /deals/{id}/briefing    → {audioUrl: str|null, transcript: str, chapters:[{title, startSec}]}
listTheses()                   → GET  /theses
saveThesis(t)                  → POST /theses
setActiveThesis(id)            → POST /theses/{id}/activate
ingestHackerNews()             → POST /ingest/hn
ingestGitHub()                 → POST /ingest/github
searchNaturalLanguage(query)   → POST /search   {query} → {criteria:[str], deals:[{id, matchPct, why, missing}], founders:[{id, matchPct, why}]}
Plus: GET /health → {"status":"ok"}
```

## DATABASE (SQLAlchemy; store nothing-discarded, serve contract shapes)
Internal tables can be normalized however sensible, BUT response assembly must produce the contract shapes. Required tables: founders, deals, deal_founders (link, lead bool, role), signals (append-only: id, founderId?, dealId?, source, signalType, rawJson, fetchedAt), claims (id, dealId, claim, status, trustScore int 0-100, detail, source, reviewNotes json, lastChecked), axis_assessments (per deal: founderAxis json, market json, ideaVsMarket json, version, createdAt — keep history rows for trend derivation), founder_scores handled as fields on founders (founderScore, components json, history json — history events: {date, event, source, delta}), theses (id, name, sectors json, stage, geography json, risk, checkSizeUsd, excludedSectors json, active bool), memos (dealId, memoJson, version, createdAt), audit_trail (dealId, decision, note, conditions, timestamp), outreach_drafts (founderId, draftText).

## INTELLIGENCE PIPELINE (behind POST /applications — the core of the product)
On application submit:
1. **Dedup founders** by email (case-insensitive), then by github/linkedin handle → reuse existing founder records; new people get new records. Never duplicate a person.
2. Store the application + cvText + each link as **signals**.
3. **First-pass filter** (mini): genuine startup vs spam/joke → non-viable stored, marked, excluded from dealflow (still in DB).
4. **Claim extraction** (mini) from tagline + application text + cvText → claims rows, each immediately given a heuristic initial trustScore of 50.
5. **GitHub enrichment**: for founders with github handles → repos, stars, account age, recent activity via GitHub API (httpx, GITHUB_TOKEN); store as signals; skip gracefully on rate limit.
6. **Founder Score** per person (transparent formula → components[] with {label, points} entries the frontend renders):
   shipped projects 15/ea cap 3 · launches 10/ea cap 3 · community min(20, 0.1×(stars+HN points)) · consistency 0-10 · prior-company bonus 15 if founder already linked to another deal · footprint 0-30 (cold-start only). Append a history event {date: today, event, source, delta} on every recompute. NEVER reset.
7. **Cold-start check**: founder with no repos/launches/funding signals → gpt-4o footprint assessment over application text + cvText (writing specificity, domain insight, any shipped artifact) → footprint score 0-30 + uncertaintyNote; set deal.isColdStart=true; the note goes into founderAxis.note.
8. **Three-axis assessment** (3 independent gpt-4o calls via asyncio.gather, active thesis passed as context, Founder Score passed into the founder-axis call as ONE input, never a substitute):
   - founderAxis: evaluates the WHOLE TEAM for THIS deal → {score 1-100 to match contract examples (helix=90 scale), trend, summary, note} + teamCoverage ratings [{area: Product|Engineering|AI/Domain|Enterprise Sales|Marketing|Finance|Operations, rating: Strong|Moderate|Weak|Missing|Unknown}] — Unknown when no evidence, never invent.
   - market: {rating Bullish|Neutral|Bear, trend, tam (string, from claims or "Not disclosed"), summary, competitors[]}.
   - ideaVsMarket: {score 1-100, trend, verdict, flexibility}.
   Trend: compare vs previous axis_assessments version for this deal, else "flat". Evidence must quote signals; thin evidence → say so in summary, don't invent.
9. **Trust pipeline** per claim: FIRST internal cross-artifact contradiction check (mini: claim vs the founder's/deal's other signals) → then Tavily external (search company + claim keywords, classify verified|contradicted|unverified, "unverified is normal for early stage"). Set status + trustScore (verified 80-98, unverified 35-65, contradicted 5-30, scaled by confidence) + detail + source. Update deal.verifications and deal.alerts counts and founder.contradictionCount.
10. **Memo** (gpt-4o) → contract memo shape {snapshot, hypotheses[], swot{strengths,weaknesses,opportunities,risks}, problemProduct, traction:[{label,value}]}. Every fact tied to a claim; contradicted claims MUST appear in swot.risks; missing data → value "Not disclosed"; no padding. Store versioned.
11. Create the Deal with pipelineStage "Application Received" → "Screening" after scoring completes, decisionDeadline = now+24h, nextAction set, and return the full contract-shaped Deal.

## OUTBOUND (behind /ingest/hn and /ingest/github)
- **/ingest/hn**: HN Algolia API (no auth) — Show HN + Launch HN, last 30 days, limit ~40. Each post → signal; author → founder record (dedup; contactStatus "Discovered"); extract GitHub/site links from post text → enrich; run the SAME pipeline steps 3-10 to create a Deal with source "Outbound — Show HN"; generate a personalized outreach draft (mini: reference their specific project, why it fits the active thesis, invite to apply — 4-6 sentences, no generic flattery) → outreach_drafts, contactStatus "Reviewing". Return {newSignals, newFounders, newDeals}.
- **/ingest/github**: GitHub search API `created:>30d stars:>50`, top ~15 repos → owners → same pipeline, source "Outbound Discovery via GitHub".
- Never send external messages — drafts only.

## SEARCH (POST /search)
gpt-4o-mini parses the natural-language query into structured criteria (sector, geography, stage, technical profile, traction, funding history, open-source experience...). Match against deals + founders in DB with a simple scorer; return criteria chips, per-result matchPct, "why" (which criteria hit, citing fields), and "missing" (criteria with no evidence). One-pass compound query resolution, not keyword search.

## BRIEFING (POST /deals/{id}/briefing)
mini condenses the memo into a ~150-word script with chapter markers (Summary, Team, Market, Product, Traction, Evidence Quality, Risks, Recommendation) → ElevenLabs TTS → save ./audio/{dealId}-{version}.mp3 → {audioUrl:"/audio/...", transcript, chapters}. No key → {audioUrl: null, transcript, chapters} without error.

## SEED SCRIPT (python -m app.seed.run)
1. Recreate the frontend's mock founders and deals FROM contract/mocks.ts (same ids: helix, quantex, loom, voyager, northgrid, brickline; amara-okafor, david-chen, etc.) so existing frontend links keep working — insert directly with their data as the baseline.
2. THEN push 8 additional synthetic applications through POST /applications (real pipeline): 4 normal, 2 with seeded contradictions (claim vs attached artifact text), 1 cold-start with strong CV text, 1 repeat founder reusing amara-okafor's email with a NEW company (demos Founder Score persistence + prior-company bonus + history event).
3. Seed 2 theses ("AI Infra US — Seed" active, "European Cold-Start Founders").
Print a demo cheat-sheet at the end: which deal ids demo contradiction / cold-start / repeat-founder.

## SMOKE TESTS (run all, fix failures, then report)
1. uvicorn boots; GET /health 200; GET /deals returns the 6 baseline + pipeline deals, camelCase fields, no averaged score field anywhere.
2. POST /applications (minimal payload) → 200; new deal appears in GET /deals; founders deduped by email; claims have trustScore ints; three axis objects present with contract-exact keys; market axis has rating not score.
3. Seeded contradiction deal: ≥1 claim status "contradicted", trustScore ≤30, appears in memo swot.risks; deal.alerts > 0.
4. Cold-start deal: isColdStart true, founderAxis.note contains uncertainty language, founder components include a footprint entry.
5. Repeat founder: one founder record, projects[] length 2, history has a new event, components include prior-company bonus.
6. GET /deals/{id}/memo: all 5 sections; at least one "Not disclosed".
7. POST /deals/{id}/decide without note → 422; with note → pipelineStage updated + audit trail row.
8. POST /search with the compound example query → criteria chips + ≥1 match with why/missing.
9. POST /ingest/hn: network ok → creates signals/founders/deals; network fail → clean JSON error, not 500.
10. Briefing without ELEVENLABS_API_KEY → 200 with audioUrl null. With key → mp3 served at /audio/....
11. Bad OPENAI_API_KEY temporarily → /applications returns structured degraded response, not a crash. Restore.
12. Responses spot-checked against contract/mocks.ts field names — write a tiny script that loads a GET /deals/{id} response and asserts every key in the mock Deal exists in the response.
13. grep: .env not committed.

Commit per module. Report: what passed, what you fixed, anything flaky.

====================================================================

---

## STEP 3 — Deploy to Render (~10 min, after smoke tests pass)

1. Push to GitHub. On render.com: New → Web Service → connect repo.
2. Build: `pip install -r requirements.txt` · Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
3. Add env vars from your .env (all of them). Instance: Free.
4. Note the URL, e.g. `https://vc-brain-api.onrender.com`. Test `/health` and `/deals` in the browser.
5. Free tier sleeps after ~15 min idle → before any demo, hit /health 2 minutes early. Optional: a cron-job.org ping every 10 min during the demo window.
6. Run the seed script against production DB: easiest is a one-off `python -m app.seed.run` locally with DATABASE_URL pointing at... (SQLite is file-local on Render, so instead: add a protected `POST /admin/seed?key=...` endpoint that runs the seed — ask Claude Code to include it — and hit it once after deploy.)

## STEP 4 — The merge (frontend flips to real API)

When backend is deployed and seeded, paste this into Lovable:

```
Connect VC Brain to the real backend. In src/lib/api.ts:
1. Set USE_MOCKS = false and API_BASE_URL = "https://YOUR-APP.onrender.com".
2. Reimplement every api.* function as a fetch call per this mapping (keep signatures
   and return types identical): listDeals→GET /deals · getDeal→GET /deals/:id ·
   starDeal→POST /deals/:id/star · decideDeal→POST /deals/:id/decide ·
   listFounders→GET /founders · getFounder→GET /founders/:id ·
   setFounderContactStatus→POST /founders/:id/contact-status · listSourcing→GET /sourcing ·
   getClaim→GET /deals/:dealId/claims/:claimId · addClaimNote→POST .../notes ·
   submitApplication→POST /applications · getMemo→GET /deals/:id/memo ·
   regenerateMemo→POST /deals/:id/memo/regenerate · generateBriefing→POST /deals/:id/briefing ·
   listTheses→GET /theses · saveThesis→POST /theses · setActiveThesis→POST /theses/:id/activate ·
   ingestHackerNews→POST /ingest/hn · ingestGitHub→POST /ingest/github ·
   searchNaturalLanguage→POST /search.
3. JSON is already camelCase — no key mapping needed. On any fetch error, show the
   existing error states; do not crash. Keep mocks.ts for types only.
```
Then click through every view. Where a field mismatch appears, copy the REAL response JSON and tell Lovable "conform this component to this exact response".

## Fallback ladder (unchanged)
Merge fails late → demo frontend in mock mode + real API in Swagger side-by-side. Render down → local uvicorn + ngrok. No ElevenLabs → audioUrl null path already handled.
