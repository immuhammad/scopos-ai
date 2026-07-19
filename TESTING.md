# TESTING.md — Manual walkthrough (every feature, in demo order)

Prereqs: backend `uvicorn app.main:app` on :8000 (seeded via `python -m
app.seed.demo`), frontend `cd frontend && npm run dev` on :8080. Use a fresh
browser profile (no cookies). Automated coverage: `python -m tests.e2e_smoke`.

## A · Public surface (logged out)
- [ ] Open `http://localhost:8080/` — landing renders: "Sign in to Scopos", nav shows only **Apply** + **Sign in**.
- [ ] Open `/dashboard` → you are redirected to `/` (no session).
- [ ] Footer of login card reads "Demo authentication — any credentials work".
- [ ] Click "Founder building a startup? Submit your company →" — `/apply` loads logged-out.

## B · Sign in + dashboard
- [ ] Sign in with any credentials → lands on the Dashboard; nav shows all sections + Sign out.
- [ ] Refresh — still signed in (cookie survives).
- [ ] Metrics strip shows real numbers (pending, decided, signal→decision, contradictions, cold-start, real-sourced); tiles click through.
- [ ] Deal list ranked; filters (stage/sector/Cold-start/High-signal) and Load-more work.
- [ ] Wishlist tab shows the 3 seeded stars (helix-runtime, quiet-systems, one live lead).
- [ ] Recent activity panel lists live signals; "Open Sourcing Feed" works.

## C · Thesis engine + search
- [ ] Thesis bar shows active thesis chips incl. ownership target %. Switch risk Balanced→Conservative → ranking re-sorts; Thesis Match popovers list rule gates (Match/Mismatch/Unknown) — axes never in the formula.
- [ ] Activate "European Cold-Start Founders" → re-rank; switch back.
- [ ] Save a new thesis with ownership % — appears in selector.
- [ ] NL search "cold-start founders with contradictions" → criteria chips + matches with why; remove a chip re-runs; clear.

## D · Deal deep-dive (use quantex-health, then metricflow)
- [ ] Overview: three-axis scorecard ("never combined"), trend pills vary (↑/↓/→ across deals — check helix-runtime ↑ vs northgrid ↓), Thesis Match panel, pipeline KV.
- [ ] High Upside · High Risk badge on polyglot-ai card; hover → tooltip states the rule.
- [ ] Team tab: Founder Axis + "Top individual Founder Score — one input" row + coverage grid.
- [ ] Trust tab (metricflow): contradicted claims ≈10% trust; open a claim → source quote + conflicting evidence + artifact named.
- [ ] Receipts tab: full pipeline trace timeline; quote-anchored claims list; artifacts.
- [ ] Memo tab: 5 sections; "Not disclosed" italics; Regenerate bumps version.
- [ ] Cold-start (quiet-systems): badge, wider-uncertainty note in Team tab, footprint component on the founder.

## E · Briefing (persistence)
- [ ] On helix-runtime Overview → Generate briefing (≈15–40s) → player with real duration; play/pause, scrub, speed × toggle.
- [ ] Navigate to another deal and back → player shows the stored briefing instantly (no regeneration).
- [ ] Hard refresh → still there. "Regenerate" replaces it.

## F · Decide + decisions + feedback
- [ ] On a clean deal: Decision tab → note required (submit empty → error) → Decline with a reasoned note → inline DecisionRecord + "Feedback stored — future evaluations for this thesis will consider your reasoning".
- [ ] Deal disappears from pending; metrics update; appears on `/decisions` with simulated label; read-only detail sheet opens; filters + signal→decision hours shown.

## G · Founders (memory)
- [ ] `/founders`: filters (status, score, contradictions) + load-more.
- [ ] amara-okafor: 2 projects (helix-runtime + helix-mesh), history events, transparent components.
- [ ] A lead founder (from Outreach) shows real GitHub/HN footprint and Discovered/Contacted status.

## H · Outbound lane (leads)
- [ ] Dashboard → Outreach tab: leads with AI-Interest scores. Open one — real links (actual Show HN post / repo), signal-strength breakdown from real footprint, NO axes/claims/memo.
- [ ] Outreach composer: edit subject/body → "Review & Send" → simulated-send toast, status → Awaiting Pitch Deck, founder → Contacted, deal → Invited.
- [ ] "Simulate application received (demo)" → ≈60–120s → deal moves to Decision-Ready with real claims/axes/memo; same founder, updated score.
- [ ] `/feed`: source chips filter; disabled coming-soon chips (arXiv/ProductHunt/Accelerators/Hackathons) + "One pipeline, many channels."; Scan Hacker News → new leads appear in Outreach ONLY (Decision-Ready count unchanged).

## I · Triage + wishlist
- [ ] `/triage`: swipe right → shortlists (star), left → declines, up → diligence; queue counts down; wishlist tab reflects stars.

## J · Founder-side apply (logged out)
- [ ] Sign out → redirected to landing; protected routes redirect again.
- [ ] `/apply` logged out: fill company + founder, attach a small PDF deck, funding sought → Submit → stepped progress UI (≈60–120s) → confirmation with real per-step receipts → (sign in) the new deal is in the Dashboard with quote-anchored claims from the PDF.
