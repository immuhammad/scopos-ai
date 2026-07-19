# AGENTS.md — VC Brain

This file exists for agent tools that read AGENTS.md instead of CLAUDE.md (Emdash workers, Codex-style agents, etc.).

**Read CLAUDE.md in this directory — it is the single source of truth.** All project context, contract rules, domain rules, stack decisions, status, and the doc map live there. Do not duplicate content here; if the two files ever disagree, CLAUDE.md wins.

Quick agent guardrails (duplicated from CLAUDE.md because they are cheap to violate):
1. Backend JSON is camelCase and conforms to the frontend contract in `contract/api.ts` + `contract/mocks.ts`.
2. Three axes never averaged. Founder Score (person, persistent) ≠ Founder Axis (team, per-deal).
3. Missing data → "Not disclosed", never invented. Contradicted claims surface in memo risks.
4. Never auto-send external messages. Never label simulated decisions as real.
5. LLM calls: Structured Outputs only, retries, degrade gracefully — an LLM failure must never 500 an endpoint.
