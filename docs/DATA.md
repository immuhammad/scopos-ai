# DATA.md — The justified demo dataset

Every seeded record exists to demonstrate a specific rubric rule or demo beat.
If a record has no justification, it is not seeded. Seeded by `python -m
app.seed.demo` — all content flows through REAL pipeline paths (claims
extracted + quote-anchored, axes assessed, trust verified, memos written by
the live models). Fixture companies are fictional and labeled synthetic; every
score on them is a genuine pipeline output.

## Pipeline deals (Decision-Ready lane)

| Deal id | Layer | Exists to demonstrate |
|---|---|---|
| `helix-runtime` | fixture-processed | The flagship healthy deal: strongest team-in-context, verified pilots. Also: **approved** (simulated decision, audit trail), **↑ trends** (v2 reassessment after a traction artifact), briefing demo target. |
| `quantex-health` | fixture-processed | Contradiction radar: deck claims vs live-artifact scan genuinely caught by the checker. **↓ trends** after a weakening follow-up artifact. |
| `loom-dev` | fixture-processed | Public-footprint founder (writing + shipped side-projects); briefing persistence test target. |
| `voyager-systems` | fixture-processed | Show-HN-origin fixture — outbound-source labeling on a processed deal. |
| `northgrid` | fixture-processed | Decline-shaped deal: multiple artifact-backed contradictions; **↓ trends** after follow-up. Decision-Ready stage pressure. |
| `brickline` | fixture-processed | Competent-but-below-bar deal; **declined with a note that contradicts the read → populates the thesis feedback loop**. Flat/mild trends (no-material-change artifact). |
| `mendel-bio` | fixture-processed | OSS-credentialed founder fixture; GitHub-source labeling. |
| `polyglot-ai` | synthetic-processed | Clean deal that qualifies for the **High Upside · High Risk** badge (Idea ≥ 65, Founder Axis < 50); **↑ idea trend** after traction artifact. |
| `metricflow` | synthetic-processed | Rubric rule 3/4: seeded deck-vs-artifact contradiction the quote-anchored checker must catch (ARR vs waitlist). |
| `securestack` | synthetic-processed | Second contradiction pattern (SOC 2 claimed vs audit-planned artifact). |
| `quiet-systems` | synthetic-processed | Cold-start founder, CV-backed footprint assessment, wider-uncertainty note (FAQ #10). **Starred** (wishlist: cold-start-high-upside slot). |
| `fieldnote-bio` | synthetic-processed | Second cold-start founder — shows the footprint path isn't a one-off. |
| `helix-mesh` | synthetic-processed | Repeat founder: Amara's second company. One founder record, two projects, history events, prior-company bonus — Founder Score persistence (rule 2/6). **Starred** (wishlist: high-conviction slot). |

## Outbound leads (Outreach lane — live, dynamic)

| Record | Layer | Exists to demonstrate |
|---|---|---|
| 4 Show HN leads + 3 GitHub leads (names vary by scan day; e.g. `lecturetobook`, `wave`, `colibri`) | **real** | The outbound funnel: real founders, real posts/repos/stars, Sourced stage, NO claims/axes/memo until an application arrives. Signal-strength breakdown from public footprint + outreach drafts (never sent). First HN lead is **starred** (wishlist: outbound slot). One lead is converged via **"Simulate application received (demo)"** during the e2e run to demonstrate Identify → Activate → Converge end-to-end. |

## Founders

| Record | Layer | Exists to demonstrate |
|---|---|---|
| Fixture founders (Amara, David, Maya, Julian, Kestrel, Elena, Harper, Sana, Noor, Lena, Raj…) | fixture | One human = one record; dedup by email; Founder Score recomputed from real signals (GitHub enrichment where handles exist). |
| `amara-okafor` | fixture | Score persistence across companies — linked to both `helix-runtime` and `helix-mesh`, history never resets. |
| `mara-lindqvist`, `june-okonkwo` | synthetic | Cold-start founders — footprint components instead of track-record components. |
| Lead founders (real HN/GitHub handles) | **real** | Discovered → Contacted → Invited contact-status funnel; synthetic `@hn.invalid`/`@github.invalid` emails are dedup keys, clearly not real addresses. |

## Theses, decisions, feedback

| Record | Exists to demonstrate |
|---|---|
| Thesis `ai-infra-us-seed` (active, Balanced, 10% ownership target) | Rule-gate Thesis Match ranking; risk-appetite gates. |
| Thesis `european-cold-start-founders` (Aggressive, 12%) | Thesis switching re-ranks the funnel; cold-start-friendly appetite. |
| Decision: `helix-runtime` **approve** | Simulated investment decision, audit trail, decided deals leave pending flow. |
| Decision: `brickline` **decline** (note contradicts the read) | Feedback loop: note stored as an `investor_feedback` signal on the active thesis, injected into future scoring. |

## Not seeded on purpose

- No fabricated "verified" claims — every status comes from the live checker.
- No hand-written memos, axes, or trust scores anywhere.
- No real-person fixture data beyond public HN/GitHub footprints.
