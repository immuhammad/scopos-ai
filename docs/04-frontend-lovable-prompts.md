# Lovable Prompt v2 — Improve the Existing "VC Brain" (venture-mind-os)

How to use: paste PROMPT 1 into the existing Lovable project. When it finishes, paste PROMPT 2 (the follow-up wave). Do NOT paste both at once — Lovable degrades on mega-prompts. The backend-merge prompt is a separate document we generate AFTER the frontend freezes.

---
---

## PROMPT 1 — Foundation wave (API layer, tabs, cofounders, founder memory)

====================================================================

Improve the existing "VC Brain" application without rebuilding it. Preserve the current premium dark visual design, typography, navigation, colour system, cards and all existing functionality (Founder Score breakdown, three-axis scorecard, Trust Score Radar, per-claim verification, AI Investment Memo, analyst briefing, 24-hour decision timer, approve/decline). Reuse existing components. Keep it investor-grade: Notion-level approachability, Bloomberg-level analytical depth. The product scope stays Sourcing → Screening → Diligence → Decision — no portfolio management, fund ops, or exit pages. Never present synthetic data as live or externally verified — label demo data clearly.

### 0. API CLIENT LAYER — do this FIRST, everything depends on it

Right now all data is hardcoded in `src/lib/vc-data.ts` and imported directly into components. Restructure data access WITHOUT changing what renders:

- Create `src/lib/api.ts` — a single client module with one exported object of typed async functions: `getDeals(thesisId?)`, `getDeal(id)`, `getFounders(filters?)`, `getFounder(id)`, `submitApplication(payload)`, `getMemo(dealId)`, `generateBriefing(dealId)`, `getSignalsFeed()`, `getTheses()`, `saveThesis(t)`, `getShortlist()`, `toggleShortlist(dealId)`, `ingestHackerNews()`, `searchNaturalLanguage(query)`.
- A `USE_MOCKS` flag (default true) and an `API_BASE_URL` constant at the top of this ONE file. In mock mode, functions resolve from the existing demo data (moved into `src/lib/mocks.ts`) with a small artificial delay so loading states render. When `USE_MOCKS=false`, they call `${API_BASE_URL}/...` REST endpoints with the same response shapes.
- Migrate every component to consume data ONLY via `api.ts` (React Query or simple hooks with loading/error/empty states). No component imports mock data directly. This is non-negotiable — a real backend will replace the mocks by flipping the flag.
- Expand mock data from 3 deals to 8 (keep helix, quantex, loom; add 5 varied: one more cold-start founder, one with heavy contradictions, one outbound Show HN discovery, one mediocre pass candidate, one repeat founder whose person already exists on another deal — same founder id across two deals).

### 1. PROJECT DETAIL TABS

The Command Center detail area is one long page. Reorganise into tabs, preserving all existing content, with URL state (`?tab=`) so tabs are shareable:

- **Overview**: company, one-liner, sector/stage/geography chips, source type, Thesis Match (see below), decision deadline + existing 24h timer, key links, short investment summary, current pipeline stage, next recommended action.
- **Founding Team**: see section 3.
- **Scorecard**: existing three-axis scorecard + Founder Score breakdown, trends, evidence-backed explanations. Keep the "never averaged" principle — never render a combined single score.
- **Evidence**: existing Trust Radar + claims table (upgraded in section 4) + evidence detail panel (section 5).
- **Investment Memo**: existing memo + actions: Copy Memo, Export (print-friendly view is fine), Regenerate (mock: re-resolves from api.ts), and an "Investor Notes" textarea persisted in local state.
- **Decision**: final recommendation, main reasons, main risks, open issues, editable decision note (REQUIRED before deciding), actions Approve / Approve with Conditions / Continue Diligence / Decline, and a decision audit trail list (decision, timestamp, note, conditions). Label approvals "Simulated investment decision — demo".

### 2. COFOUNDERS ON THE APPLY PAGE

Keep current minimum fields (company name, lead founder name, email, deck, links). Add:
- A "+ Add Cofounder" secondary button → dynamic list of cofounder cards. Per cofounder: full name, email, role (CEO/CTO/COO/CPO/Other), LinkedIn URL, GitHub URL, personal website (optional), primary expertise, previous projects (optional). Compact editable cards with number, name, role, completion state, edit and remove. Validate emails and URLs; block duplicate emails.
- A "Video Pitch (optional)" upload field — accept a file or URL, show as a labeled placeholder chip ("Demo — video not processed"). Do not build playback/processing.
- A submission summary step before send: company, lead founder, cofounder count, deck uploaded, links, video pitch present.
- On submit (mock), all founders link to the same project.

### 3. FOUNDER SCORE vs FOUNDER AXIS — team assessment

This distinction is essential and must be visible in the UI:
- **Founder Score** = one PERSON, persistent across companies, never resets, has history.
- **Founder Axis** = one OPPORTUNITY, evaluates the whole founding TEAM in context — composition, role coverage, execution. It must not simply copy the lead founder's Founder Score.

In the Founding Team tab for each deal: lead founder + cofounders, each with role and individual Founder Score chip (clickable → their founder profile page); a Team Coverage matrix (Product, Engineering, AI/domain, Enterprise sales, Marketing, Finance, Operations) rated Strong / Moderate / Weak / Missing / Unknown — never invent, use Unknown; a short team insight paragraph (complementary skills, key-person dependency, single-founder risk, hiring priorities). For Helix Runtime, demo: Founder Axis 90 (Improving); Amara Okafor CEO FS 92, David Chen CTO FS 84, Maya Brooks COO FS 79; coverage Technical Strong, AI Infra Strong, Enterprise Sales Moderate, Finance Moderate.

### 4. FOUNDERS — the project-independent memory

New main nav item "Founders" → route `/founders`. This is NOT another dealflow list — it is the persistent Founder Memory across all projects:
- Table: name, current company, role, Founder Score + trend arrow, location, expertise, # known projects, relationship status (Discovered / Reviewing / Contacted / Invited to Apply / Applied / In Diligence / Funded / Passed), last signal, contradiction indicator.
- Search + filters: score range, trend, expertise, geography, prior founder experience, contact status.
- Founder profile pages `/founders/:id`: Founder Score + component breakdown + a compact score-history time-series chart with clickable timeline events (OSS launch, traction increase, cofounder joined, claim contradicted — each event shows what happened, evidence source, score impact, date). Skills, public profiles, all projects/companies (the repeat founder shows TWO deals), cofounder relationships, previous applications and decisions, contradictions.
- Same person across projects = ONE founder record (match by email/handle). Never duplicate.

### 5. NUMERIC TRUST SCORES + EVIDENCE PANEL

Keep verified/unverified/contradicted statuses; add a numeric Trust Score (0–100%) per claim. Claims table columns: status icon, claim, Trust Score, evidence summary, source, last checked, actions. Filters: All / Verified / Unverified / Contradicted / Low confidence. Clicking a claim opens a right-side evidence panel: full claim, status, numeric score, exact evidence, source link (or "Not provided" disabled state — NEVER "#" or generic github.com), collected/verified dates, conflicting evidence for contradictions, AI explanation, and actions: Open Source, Mark for Human Review, Add Reviewer Note (persist in state), Request Clarification (opens an editable simulated message composer with a confirmation step — never auto-sends).

### 6. FIX PLACEHOLDER LINKS

Project link buttons (Pitch Deck, GitHub, Twitter, Website) must be deal-specific. Synthetic deals: labeled demo modals (e.g., embedded fake deck viewer with "Demo content"). Missing link → disabled button + "Not provided". No generic or "#" destinations anywhere.

====================================================================

---
---

## PROMPT 2 — Intelligence wave (paste AFTER Prompt 1 completes and renders correctly)

====================================================================

Continue improving VC Brain. Same rules: preserve design, reuse components, everything through `src/lib/api.ts`, label demo data.

### 7. THESIS ENGINE + THESIS MATCH

- Upgrade the existing filter bar into a Thesis panel: keep sector/stage/geography/risk/check-size; add target ownership, max valuation, excluded sectors, preferred founder profile. Actions: Save Thesis, Duplicate, Set as Active. Support multiple saved theses (e.g., "European AI Infra — Pre-Seed", "Technical Cold-Start Founders"). Active thesis name shows in the top nav.
- Every deal card and Overview tab shows **Thesis Match %** with a breakdown popover (sector Match/Mismatch, stage, geography, check size, ownership Unknown when undisclosed, excluded-sector check) and a one-sentence explanation. Thesis Match is a relevance/filter metric — visually distinct from the three axes, NEVER averaged with them, never presented as a fourth axis.

### 8. NATURAL-LANGUAGE MULTI-ATTRIBUTE SEARCH

Prominent search field on the Command Center: placeholder "Describe the founder or opportunity you are looking for…". Example: "technical founding teams in Europe building AI infrastructure, enterprise traction, no prior VC funding, at least one founder with open-source experience". Parse (via api.searchNaturalLanguage — mock: a simple parser over the mock attributes) into removable criteria chips; results show matching deals + founders with match % and "why matched" + "missing/uncertain criteria" per result. This resolves compound queries in one pass, not five manual filters.

### 9. SOURCING FEED + OUTBOUND ACTIVATION

- New route `/feed`: live signal stream table — time, source tag (HN / GitHub / Inbound / Synthetic), founder (links to profile), type, snippet. Buttons "Scan Hacker News" and "Scan GitHub Trending" call api.ingest* with loading state and a result toast ("14 new signals · 6 new founders" — mock adds a few new rows).
- For outbound-sourced deals: an "Invite Founder to Apply" action showing why they were discovered, Thesis Match, contact status, last attempt, and a **generated outreach draft in an editable simulated composer** with an explicit confirm step — never auto-sent. Once "applied" (simulate), the application links to the existing founder and deal records — no duplicates, status moves to Applied, and the deal enters the same pipeline as inbound.

### 10. PIPELINE, SHORTLIST, DILIGENCE-LITE

- Every deal shows a pipeline stage chip: Sourced → Invited → Application Received → Screening → Diligence → Decision Ready → Approved/Declined. Show time-in-stage + next required action + blocking issue if any.
- **Shortlist**: star icon on every deal card and detail header; `/shortlist` view (or a Command Center filter tab) listing starred deals. Persist in state via api.toggleShortlist.
- **Diligence tab (lightweight)** on each deal: checklist grouped Commercial / People / Technical / Financial / Legal with 3-5 items each; per item: status (Not Started / In Progress / Waiting for Founder / Completed / Blocked / N/A), priority, blocking toggle, note. **Auto-task rule:** any memo field that reads "Not disclosed" or "Unavailable" generates a corresponding diligence task (e.g., "Cap table missing — Waiting for Founder — Blocks decision: Yes"). Add a "Request Missing Information" button → editable simulated request listing all missing items with confirm step.
- Decision confirmation panel (before Approve/Decline): company, check size, recommendation, Thesis Match, the three axes, open contradictions, blocking diligence tasks, missing critical info, top reasons and risks, required decision note. Blocking tasks or open contradictions show a warning but can be overridden as "Accepted risk" (recorded in the audit trail).

### 11. CONTRADICTION WORKFLOW (lightweight)

In the Evidence tab, contradicted claims get a status workflow: Open → Clarification Requested → Founder Responded → Resolved / Accepted Risk. "Request Clarification" generates an editable question (e.g., "The deck reports $240,000 ARR while the financial export confirms $185,000 — please explain and provide documentation."), simulated composer, confirm step. Status changes appear in the deal's activity log.

### 12. ACTIVITY LOG + ANALYSIS REFRESH

- Each deal gets an activity timeline (Overview tab bottom or its own panel): discovered, application received, cofounder added, claim verified, contradiction detected, clarification requested, score changed, memo updated, decision recorded — each with timestamp, actor (System / Investor), description.
- A "Re-run Analysis" button on the deal header: mock increments an analysis version, records a version-history entry (version, date, trigger, changed claims/scores, previous vs current recommendation) viewable in a small history drawer. Full version diffing is out of scope — just the history list.

### 13. ANALYST BRIEFING PLAYER

Upgrade the existing briefing to a proper player: play/pause, progress bar, speed (1x/1.25x/1.5x), transcript toggle, chapter markers (Summary, Team, Market, Product, Traction, Evidence, Risks, Recommendation) that seek on click, updated timestamp, "Generate New Briefing", loading and error states. If no real audio exists, use a labeled demo state with visibly functional controls.

### 14. POLISH PASS

Skeleton loaders on every api.ts call, empty states, error states, tooltips explaining scoring terms (Founder Score vs Founder Axis, Trust Score, Thesis Match), green/amber/red semantics with labels + icons (never colour alone), sticky deal header and sticky decision controls, responsive down to tablet. Verify every button added in both prompts actually does something.

====================================================================

---

## Acceptance check (run through this after Prompt 2)
- All data flows through api.ts; flipping USE_MOCKS=false changes fetch targets only.
- Apply page: multi-cofounder add/edit/remove works, all founders link to one project.
- /founders exists, independent of dealflow; repeat founder appears once with two projects; profile shows score history with clickable events.
- Founder Axis ≠ lead founder's Founder Score anywhere; three axes never averaged; Thesis Match never presented as a fourth axis.
- Every claim has a numeric Trust Score; clicking opens the evidence panel; contradictions have a resolution workflow.
- Missing memo info auto-creates diligence tasks; decision requires a note; audit trail records decisions; approvals labeled simulated.
- No "#" or generic placeholder links anywhere.
- Existing dark design intact; app responsive.
