# CLAUDE.md — VC Brain (Hack-Nation Challenge 02)

Read this first in every session. Full details live in /docs — this file is the always-loaded summary.

## What we are building
"VC Brain" — an AI-first VC operating system for the Hack-Nation 6th Global AI Hackathon, Challenge 02 (Maschmeyer Group). Pipeline: **Sourcing → Screening → Diligence → Decision**. Goal: a $100K invest/pass recommendation an investor can act on within 24 hours, for ANY founder — including cold-start founders with no GitHub, no funding, no network.

Out of scope (brief says explicitly): portfolio monitoring, follow-on, fund ops, exit. Never build these.

## Team & repos
- Ahmad (lead): backend, integration, this repo's owner
- Frontend: built in Lovable, SEPARATE repo (venture-mind-os). Live: https://venture-mind-os.lovable.app
- Backend: FastAPI (repo: vc-brain-api), built via Claude Code from docs/03-backend-build-and-merge.md

## THE CONTRACT (most important rule in this file)
The frontend's `src/lib/api.ts` + `src/lib/mocks.ts` define the API contract. The backend CONFORMS TO THE FRONTEND, never the reverse. Copies live in the backend repo under `contract/`.
- JSON responses are **camelCase** (founderScore, pipelineStage, isColdStart, founderAxis, ideaVsMarket, teamCoverage, askUsd, decisionDeadline, contactStatus, timeInStageHours, nextAction, founderIds, reviewNotes, trustScore)
- Enums verbatim from mocks.ts: Trend = "up"|"flat"|"down" · MarketRating = "Bullish"|"Neutral"|"Bear" · ClaimStatus = "verified"|"unverified"|"contradicted"
- **Market axis has NO numeric score** — rating + trend + tam + summary + competitors[]
- Deal links[].href is string|null — null when missing, never "#"
- IDs are kebab-case string slugs
- Any api.ts signature change must be announced in team chat; additive fields fine, renames forbidden

## Domain rules the judges grade (violating these loses points)
1. THREE independent axes — Founder / Market / Idea-vs-Market — **NEVER averaged** into one number, anywhere, including UI payloads.
2. **Founder Score ≠ Founder Axis.** Founder Score: one PERSON, persistent, survives across companies, never resets, has history events. Founder Axis: one OPPORTUNITY, evaluates the whole TEAM in context. Founder Score is one INPUT to the founder axis, never a substitute.
3. **Trust Score is per CLAIM** (0-100 numeric + verified/unverified/contradicted status), verified externally where possible, contradictions flagged before reaching the investor. "Unverified" is normal for early startups, not damning.
4. **Missing data is flagged, never fabricated.** Memos write exactly "Not disclosed" / "Unavailable". A memo that marks its gaps scores HIGHER.
5. **Cold-start founders are first-class.** No track record → footprint assessment (writing specificity, domain insight, CV, small shipped artifacts) with an explicit wider-uncertainty note. Generic pipelines that ignore this score poorly (their FAQ #10).
6. **One funnel.** Outbound-discovered founders are scored identically to inbound applicants and converge into the same pipeline. Dedup by email/handle — one human = one founder record, across all projects.
7. Never auto-send external messages. Outreach = editable drafts with simulated composer + confirm step.
8. Simulated decisions are labeled simulated.

## Stack
- Backend: Python 3.11, FastAPI, SQLAlchemy 2.x, SQLite. OpenAI SDK (gpt-4o: axis scoring/memos/cold-start; gpt-4o-mini: extraction/filter/trust/synthetic/outreach/search-parsing), ALL calls via Structured Outputs (`client.beta.chat.completions.parse` + Pydantic), temp 0.2 (synthetic 0.8). tavily-python for external verification. httpx for HN Algolia + GitHub APIs. ElevenLabs TTS via httpx, graceful no-op without key. Retry wrapper 2x exponential; LLM failures degrade with an errors field, never 500.
- Frontend: Lovable (TanStack Start + shadcn, dark navy). We do not hand-edit it here — changes go through Lovable prompts (docs/04).
- Deploy: Render free tier (backend). CORS_ORIGINS env must include the lovable.app origin. Free tier sleeps — hit /health 2 min before demos.

## Credits/keys in play
OpenAI (core LLM), Tavily (claim verification), Lovable (frontend), ElevenLabs (audio briefing, optional), Woz + Emdash (dev tooling for Claude Code itself). Keys in .env, never committed.

## Evaluation weights we optimize for
Data Architecture & Intelligence 30% · Investment Utility (actionable in 24h) 30% · Analysis & Trust 25% · UX 15%. When trading off, protect the 55% (data + reasoning) over UI polish.

## Current status (update this section as things change)
- [x] Frontend v2 in Lovable: api.ts layer, founders memory, team coverage, evidence panel, pipeline stages
- [ ] Frontend punch list (docs/04 §punch-list): submitApplication store insert, thesis engine, NL search, /feed, /triage swipe, CV field, numeric trustScore
- [x] Backend repo created + contract/ copied (docs/03 Step 1) — built IN this repo (no separate vc-brain-api); Python 3.9
- [x] Backend built via one-go prompt + smoke tests green (docs/03 Step 2) — 36/36, merged PR #1; seeded vcbrain.db in repo root
- [ ] Render deploy + seed (docs/03 Step 3)
- [ ] Merge: USE_MOCKS=false (docs/03 Step 4)
- [ ] Demo rehearsed + backup recording + submission (docs/05)

## Doc map
- docs/01-project-scope.md — challenge brief distilled: requirements, FAQ traps, memo spec
- docs/02-architecture.md — system design, data flow, DB schema, endpoint map
- docs/03-backend-build-and-merge.md — setup steps, the one-go Claude Code build prompt, deploy, merge procedure
- docs/04-frontend-lovable-prompts.md — Lovable prompt waves + current punch list
- docs/05-demo-and-submission.md — 60s demo script, fallback ladder, submission checklist
- docs/99-archive-initial-fullscope-pack.md — superseded first plan (reference only; contract rules above override it)
- Hackathon PDFs: drop into docs/briefs/ when added
