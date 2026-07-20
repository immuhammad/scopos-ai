<div align="center">

# 🎯 Scopos

### The AI Operating System for Venture Capital

**Sourcing → Screening → Diligence → Decision** — a $100K invest/pass
recommendation an investor can act on within **24 hours**, for **any** founder,
including cold-start founders with no track record.

Built for **“The VC Brain: Deploying $100K Checks in 24 Hours”** —
Hack-Nation 6th Global AI Hackathon · Challenge 02 · Maschmeyer Group × MIT Clubs of Northern California & Germany

[Feature inventory](FEATURES.md) · [Manual test script](TESTING.md) · [Dataset justification](docs/DATA.md) · [Challenge brief](docs/The-VC-Brain.docx.pdf)

<img src="docs/media/landing.jpg" alt="Scopos landing" width="850"/>

</div>

---

## 🎬 Demo

<p align="center">
  <a href="docs/media/scopos-demo.mp4">
    <img src="docs/media/demo-poster.jpg" width="820" alt="Watch the Scopos product walkthrough — 55-second narrated demo" />
  </a>
</p>

<p align="center"><em>▶ <strong>55-second narrated walkthrough</strong> — click the poster to play (opens GitHub's video viewer). Sourcing → screening → quote-anchored diligence → the 24-hour $100K decision.</em></p>

<p align="center">
  <img src="docs/media/triage-swipe-1.gif" width="270" alt="Mobile triage — swiping from a cold-start deal to a strong deal" />
  &nbsp;&nbsp;
  <img src="docs/media/triage-swipe-2.gif" width="270" alt="Mobile triage — swiping from a strong deal back to a cold-start deal" />
</p>

<p align="center"><em>The mobile-first <code>/triage</code> swipe flow between a <strong>cold-start</strong> deal (wider uncertainty, still first-class) and a strong deal — three independent axes, thesis match, and a concrete next action on every card. Source clips: <a href="docs/media/triage-swipe-1.mp4"><code>triage-swipe-1.mp4</code></a> · <a href="docs/media/triage-swipe-2.mp4"><code>triage-swipe-2.mp4</code></a>.</em></p>

| | |
|---|---|
| 📺 **Product walkthrough** | ▶ [55-second narrated demo](docs/media/scopos-demo.mp4) (also embedded above). For an auto-playing inline player, drag the mp4 into this README via GitHub's **web editor** — repo-committed mp4s open in the file viewer rather than embedding inline. |
| 🖥️ **Live link** | **https://scopos-ai.vercel.app** — frontend on Vercel, API on Render ([health](https://scopos-api.onrender.com/health)); free tiers sleep, so the first load can take ~60s while the backend wakes |

## 📸 Screenshots

| Dashboard — the loading dock | Trust Radar — contradiction caught |
|---|---|
| <img src="docs/media/dashboard.jpg"/> | <img src="docs/media/trust-radar.jpg"/> |
| Live funnel metrics, two pipelines (Decision-Ready / Outreach), wishlist, rule-gate Thesis Match | The $1.2M-ARR claim genuinely contradicted by the submitted artifact — 10% trust, quote attached |

| Receipts — agentic traceability | Founder Memory — the Founder Score |
|---|---|
| <img src="docs/media/receipts.jpg"/> | <img src="docs/media/founder-memory.jpg"/> |
| Every pipeline step logged: model, one-line summary, duration | Per-person, persistent, transparent components — survives across companies, never resets |

| Decisions — review & audit | |
|---|---|
| <img src="docs/media/decisions.jpg"/> | Every simulated decision with its required note; decided deals leave the pending funnel |

## 🧠 What Scopos does

The challenge: *“Imagine running the world's largest Shark Tank for AI
innovation… find them first, understand what they're capable of, and back them
before the rest of the world catches on.”* Scopos is that system — one funnel
where discovered founders and inbound applicants converge, every claim is
evidence-checked, and a decision-ready memo lands inside the 24-hour window.

```mermaid
flowchart LR
  subgraph Sourcing
    HN[Show HN scan] --> L[Outbound leads<br/>real founders + signals]
    GH[GitHub trending scan] --> L
    L -- outreach draft · simulated send --> L2[Invited]
    L2 -- application arrives<br/>or demo-simulated --> P
    A[Public founder portal<br/>deck PDF + CV] --> P
  end
  subgraph "One pipeline"
    P[Viability filter] --> C[Quote-anchored<br/>claim extraction]
    C --> T[Per-claim Trust Score<br/>cross-artifact + web verify]
    C --> X[Three independent axes<br/>Founder · Market · Idea-vs-Market]
    T --> M[Evidence-backed memo<br/>gaps say 'Not disclosed']
    X --> M
  end
  M --> D[Decision terminal<br/>note required · simulated $100K]
  D -- decline feedback --> Mem[(Memory:<br/>Founder Score · signals · thesis feedback)]
  Mem -.sharpens.-> X
```

## ✅ Challenge scorecard (MVP requirements from the brief)

| # | Brief requirement | Scopos | Status |
|---|---|---|---|
| 1 | **Founder Score** — a credit score for founders; persists, never resets; one input to every decision | Per-person score with transparent point components, history timeline, repeat-founder bonus; feeds the Founder Axis as ONE labeled input | ✅ Live |
| 2 | **Data Management** — collect, validate, structure heterogeneous data | Append-only signal store (decks, CVs, HN posts, repos, feedback); dedup by email→handle; PDF text extraction; idempotent migrations | ✅ Live |
| 3 | **Multi-Attribute Reasoning** — complex natural-language queries | NL search: one LLM parse → criteria chips → deterministic scorer with match % / why / missing | ✅ Live |
| 4 | **Inbound** — apply with deck + name minimum; fast first-pass screen | Public portal (company + founder + deck), server-side PDF parsing, two-tier screening (zero-cost deterministic pre-screen → LLM viability filter), live stepped progress → receipts | ✅ Live |
| 5 | **Outbound** — Identify · Activate · Converge, one funnel | Real HN + GitHub scans create leads; outreach drafts (sends simulated); convergence runs the full inbound pipeline on the same founder | ✅ Live (converge demo-labeled) |
| 6 | **Multi-Axis Screening** — three independent axes, never averaged, with trends | Founder / Market (Bullish·Neutral·Bear, no numeric score) / Idea-vs-Market; trends from real version comparison | ✅ Live |
| 7 | **Evidence-backed memos & Trust Score** — every claim traces to evidence; flag contradictions | Quote-anchored claims (no quote → no claim), per-claim 0–100 Trust Score, cross-artifact + Tavily verification, contradictions forced into memo risks, gaps say “Not disclosed” | ✅ Live |
| 8 | **Investor-grade UX** — Notion-approachable, Bloomberg-deep | Dark-navy design system, metrics hero, filters everywhere, judge-facing captions, mobile triage | ✅ Live |

**Stretch goals**

| Stretch | Scopos | Status |
|---|---|---|
| Agentic Traceability — cite the exact data point behind every conclusion | Receipts tab: full step-level trace (model, summary, ms) + per-claim source quotes | ✅ Live |
| Self-Correction Loops — validator against external evidence | External web verification with name-collision, self-quote and rounding guards; “absence ≠ contradiction” enforced in code | ✅ Live (partial — no market-database cross-reference) |
| Sourcing & Network Intelligence — model the sourcing graph | Channel chips + per-channel source labeling today | 🚧 Coming soon |

**Evaluation-criteria alignment**: Data Architecture & Intelligence 30% → quote-anchored memory + honest gaps · Analysis & Trust 25% → per-claim Trust Radar · Investment Utility 30% → 24h clock, signal→decision metrics, decision terminal · UX 15% → see screenshots.

## 🔍 The machinery judges should poke at

- **Cold-start founders are first-class** (the brief's explicit warning): no track record → CV/writing footprint assessment with a wider-uncertainty note — see deals `quiet-systems`, `fieldnote-bio`.
- **Seeded contradictions are caught, not scripted** — `metricflow` / `securestack` carry deck-vs-artifact conflicts the checker must genuinely find (and did; see the Trust tab).
- **Decline-feedback loop**: a decision note that contradicts the system's read is stored against the active thesis and injected into future scoring — “feeds back into Memory to sharpen future scoring.”
- **Degrade-not-500**: every LLM call retries then lands in the deal's `errors` field.
- **Simulated ONLY where honesty demands it**: outreach sends, the $100K decision, demo auth, lead-application convergence — all labeled in the UI.

## 🗂 Repository layout

| Path | What it is |
|---|---|
| `app/` | FastAPI backend — pipeline, trust radar, memos, leads, metrics |
| `frontend/` | The Scopos web app (TanStack Start + shadcn; mirrored from the Lovable-managed `venture-mind-os` repo via `scripts/sync-frontend.sh`) |
| `docs/` | Planning docs, challenge brief PDF, `DATA.md`, screenshots in `docs/media/` |
| `tests/` | `python -m tests.e2e_smoke` — 46-check suite |
| `contract/` | Frozen frontend API contract the backend conforms to |

## 🚀 Run locally

```bash
# Backend — http://127.0.0.1:8000
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env            # add OPENAI_API_KEY, TAVILY_API_KEY, GITHUB_TOKEN (+ ELEVENLABS_API_KEY)
.venv/bin/python -m app.seed.demo          # justified demo dataset (live LLM run, ~20 min)
.venv/bin/python -m uvicorn app.main:app

# Frontend — http://localhost:8080  (sign in with any credentials — demo auth)
cd frontend && npm i && npm run dev

# Verify
.venv/bin/python -m tests.e2e_smoke --fast
```

## ☁️ Deploy (live link)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/immuhammad/scopos-ai)

**Live now**: app → **https://scopos-ai.vercel.app** · API → **https://scopos-api.onrender.com** ([`/health`](https://scopos-api.onrender.com/health)). Both free tiers sleep — hit the API `/health` ~2 min before demos; the first wake takes 30–60s.

1. **Backend → Render**: click the button above (blueprint = [`render.yaml`](render.yaml)) → fill the 4 keys → deploy. The seeded `vcbrain.db` ships in the repo, so the service boots with the full demo dataset — no shell/seed step. Live writes reset to the committed snapshot on each redeploy.
2. **Frontend → Vercel**: import this repo → set **Root Directory = `frontend`** → add env vars `VITE_API_BASE_URL = https://scopos-api.onrender.com` (**no trailing slash** — it produces `//`-prefixed API paths that 404) and `NITRO_PRESET = vercel` (Lovable's build config otherwise targets Cloudflare) → deploy. The Vercel origin must be listed in the backend's `CORS_ORIGINS` (already in `render.yaml`).
3. **Instant no-account fallback** for a live call: `brew install cloudflared && cloudflared tunnel --url http://127.0.0.1:8000` exposes the local backend in seconds (`ngrok http 8000` works too).

## 🚧 Coming soon

- arXiv / ProductHunt / accelerator-cohort / hackathon-winner sourcing channels (chips already in the Sourcing page)
- Sourcing-graph network intelligence (stretch goal 3)
- Real authentication & real outreach delivery (simulated by design today)
- Server-side pagination · scanned-deck OCR

---

<div align="center">

**Product code says Scopos everywhere; planning docs under `docs/` keep the challenge-era name “VC Brain” for historical context.**

Built with FastAPI · SQLite · OpenAI Structured Outputs · Tavily · ElevenLabs · TanStack Start · shadcn/ui

</div>
