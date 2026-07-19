# 05 — Demo Script & Submission

## Pre-demo ritual (T-15 minutes)
1. Hit backend /health (Render cold start takes 30-60s)
2. Open every demo deal once → memos served from cache, no live LLM wait
3. Generate the ElevenLabs briefing for the hero deal (if key approved)
4. Phone check: open the live Lovable URL on mobile for the /triage moment
5. Backup recording ready on desktop (recorded at feature freeze — non-negotiable)

## 60-second demo arc (5 beats + close)
1. **Outbound (0-12s):** /feed → click "Scan Hacker News" live → new signals + discovered founders appear. "Founders who never applied — found, scored like applicants, outreach drafted." Open one outreach draft in the composer.
2. **Dealflow (12-25s):** Command Center, active thesis visible. Ranked deals with Thesis Match %. Point at a deal where the axes disagree: "Three independent axes — never averaged. The disagreement IS the signal: Founder strong, Idea-vs-Market weak."
3. **Trust catch (25-38s):** open the contradiction deal → red claim rows: "Claimed $500K ARR — their own site says beta waitlist. Caught before it reached the investor. Trust is per claim, with receipts." Memo shows it in Risks.
4. **Cold-start (38-48s):** open the cold-start deal → amber uncertainty note: "No GitHub, no funding — scored on footprint and CV, uncertainty stated, not hidden. The founder the network-gated system never sees."
5. **Decision (48-58s):** high-conviction deal → memo → INVEST $100K (labeled simulated) → play 5s of the audio analyst briefing. Optional flick to /triage on the phone: "overnight discoveries, cleared over coffee."
6. **Close (58-60s):** "Today: one fund's brain. The platform: every VC registers a thesis, the same sourcing layer routes each founder to the funds that match. Capital by merit, at machine speed."

## One-minute pitch answers (they will ask)
- **User:** a solo investor / small fund partner
- **Workflow:** thesis → ranked dealflow → evidence + trust → memo → decision, 24h clock
- **Technical approach:** Memory (append-only signals, dedup, persistent Founder Score) → Intelligence (structured-output LLM axes, per-claim trust with internal + Tavily verification, cold-start footprint path) → Experience (Lovable dashboard)
- **Key tradeoff:** depth of sourcing + honest reasoning over UI breadth; simulated execution (no real transfers) clearly labeled

## Submission checklist
- [ ] Backend repo public, README, .env absent from history
- [ ] Frontend repo (Lovable export) linked or included
- [ ] Live app URL works from a phone on mobile data (not just your wifi)
- [ ] All demo deals: memos cached, briefing generated
- [ ] Backup video recorded and linked in README
- [ ] README "Tradeoffs / next steps": sourcing graph channels (arXiv, ProductHunt, accelerators), real outreach sending, prediction intervals on soft-skill assessment, multi-tenant marketplace
- [ ] Demo rehearsed twice, timed under 60s
- [ ] Submission form filled (repo + live URL + video)

## Judge-facing lines worth landing verbatim
- "The system never forgets: ship once, and your next idea starts from a stronger position" — show the repeat founder's carried-over Founder Score.
- "We distinguish 'no evidence' from 'bad evidence'" — unverified vs contradicted.
- "A memo that marks its own gaps is more trustworthy than one that fills them in invisibly" — point at "Not disclosed".
