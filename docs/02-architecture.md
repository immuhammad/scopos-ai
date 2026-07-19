# 02 — Architecture

## System overview
```
                    ┌─────────────────────────────────────────┐
  OUTBOUND          │              BACKEND (FastAPI)           │        FRONTEND (Lovable)
  HN Algolia ──────►│ ingest → signals (append-only)          │
  GitHub API ──────►│    │                                     │   venture-mind-os.lovable.app
                    │    ▼                                     │   src/lib/api.ts (USE_MOCKS flag)
  INBOUND           │ dedupe (email/handle → one human)       │◄── fetch, camelCase JSON
  POST /applications│    ▼                                     │
  (deck text, CV,   │ first-pass filter (mini)                │   Views: Command Center (tabs),
   cofounders,      │    ▼                                     │   /founders + /founders/:id,
   links, video)    │ claim extraction (mini) → claims        │   /apply (cofounders, CV, video),
                    │    ▼                                     │   /feed (sourcing), /triage (swipe)
                    │ enrichment (GitHub) → more signals      │
                    │    ▼                                     │
                    │ Founder Score (per person, persistent,  │
                    │   formula + history events)             │
                    │    ▼                                     │
                    │ cold-start footprint (4o) if no record  │
                    │    ▼                                     │
                    │ 3-axis assessment (3× 4o, independent,  │
                    │   thesis lens, teamCoverage)            │
                    │    ▼                                     │
                    │ trust: internal contradiction check →   │
                    │   Tavily external → per-claim score     │
                    │    ▼                                     │
                    │ memo (4o, gaps = "Not disclosed")       │
                    │    ▼                                     │
                    │ deal (pipelineStage, 24h deadline)      │
                    │ + outreach draft (outbound only)        │
                    │ + briefing (ElevenLabs, optional)       │
                    └─────────────────────────────────────────┘
```
One funnel: outbound-discovered founders run the SAME steps as inbound from the filter onward.

## Model routing
| Task | Model | Why |
|---|---|---|
| First-pass filter, claim extraction, trust classification, outreach drafts, NL-search parsing, briefing script, synthetic data | gpt-4o-mini | bulk, cheap, fast |
| 3-axis scoring, cold-start footprint, memo generation | gpt-4o | judgment quality |
All via Structured Outputs (parse + Pydantic). Temp 0.2; synthetic 0.8. Retry 2× exponential; degrade, never 500.

## Contract (authoritative: frontend contract/api.ts + contract/mocks.ts)
- camelCase JSON everywhere. Trend "up"|"flat"|"down". Market axis = rating (Bullish/Neutral/Bear) + trend + tam + summary + competitors — NO numeric score. founderAxis + ideaVsMarket have numeric scores. links[].href string|null. String slug IDs.

## Endpoint map (api.ts function → REST)
```
listDeals→GET /deals · getDeal→GET /deals/{id} · starDeal→POST /deals/{id}/star
decideDeal→POST /deals/{id}/decide (note required; audit trail row)
listFounders→GET /founders · getFounder→GET /founders/{id}
setFounderContactStatus→POST /founders/{id}/contact-status
listSourcing→GET /sourcing
getClaim→GET /deals/{d}/claims/{c} · addClaimNote→POST /deals/{d}/claims/{c}/notes
submitApplication→POST /applications (accepts cvText, videoPitchUrl extras)
getMemo→GET /deals/{id}/memo · regenerateMemo→POST /deals/{id}/memo/regenerate
generateBriefing→POST /deals/{id}/briefing → {audioUrl|null, transcript, chapters}
listTheses→GET /theses · saveThesis→POST /theses · setActiveThesis→POST /theses/{id}/activate
ingestHackerNews→POST /ingest/hn · ingestGitHub→POST /ingest/github
searchNaturalLanguage→POST /search → {criteria[], deals[{id,matchPct,why,missing}], founders[...]}
GET /health · POST /admin/seed?key=... (protected, post-deploy seeding)
```

## Database (SQLite, SQLAlchemy — normalize internally, assemble contract shapes at the edge)
- **founders**: slug id, name, role, email, linkedin/github/website, location, expertise[], founderScore, components json, history json (events {date, event, source, delta}), contactStatus, contradictionCount, bio
- **deals**: slug id, company, tagline, sector/stage/geography, source, isColdStart, pipelineStage, timeInStageHours, nextAction, askUsd, createdAt, decisionDeadline, starred
- **deal_founders**: dealId, founderId, role, lead bool
- **signals** (append-only, never mutate): id, founderId?, dealId?, source (hn|github|inbound_application|synthetic), signalType, rawJson, fetchedAt
- **claims**: id, dealId, claim, status, trustScore 0-100, detail, source, reviewNotes json, lastChecked
- **axis_assessments**: dealId, founderAxis json (incl. teamCoverage), market json, ideaVsMarket json, version, createdAt — history rows → trend derivation
- **theses**: id, name, sectors[], stage, geographies[], risk, checkSizeUsd, excludedSectors[], active
- **memos**: dealId, memoJson, version, createdAt
- **audit_trail**: dealId, decision, note, conditions, timestamp
- **outreach_drafts**: founderId, draftText, createdAt

## Founder Score formula (transparent; breakdown rendered by frontend as components[])
shipped projects 15/ea (cap 3) · launches 10/ea (cap 3) · community min(20, 0.1×(stars+HN pts)) · consistency 0-10 · prior-company bonus 15 (founder already on another deal) · footprint 0-30 (cold-start only, from 4o assessment over application + CV). Recompute on every new signal; append a history event; never reset.

## Trust score mapping
verified 80-98 · unverified 35-65 · contradicted 5-30 (scaled by classifier confidence). Order: internal cross-artifact contradiction check FIRST, Tavily external second. Contradictions update deal.alerts + founder.contradictionCount and must appear in memo swot.risks.

## Deploy
Backend on Render free tier (sleeps ~15min idle → /health warm-up before demos; optional cron ping). CORS_ORIGINS includes https://venture-mind-os.lovable.app. SQLite is instance-local → seed via protected /admin/seed after deploy. Audio served from /audio StaticFiles.

## Failure/fallback ladder
1. Lovable↔API mismatch late → demo frontend in mock mode + real API in Swagger side-by-side (shapes identical by design)
2. Render down → local uvicorn + ngrok, update API_BASE_URL
3. No ElevenLabs key → audioUrl null path, UI hides player
4. LLM outage mid-demo → memos are pre-generated and cached in DB; demo reads cache
