"""Seed: recreate the frontend's mock universe from contract/mocks.ts (via the
generated mocks.json), then push 8 synthetic applications through the REAL
intake pipeline. Run with: python -m app.seed.run"""
import asyncio
import json
import os
import re
from datetime import datetime, timedelta, timezone

from app.db import Base, SessionLocal, engine
from app.models import (AxisAssessmentRow, ClaimRow, DealFounderRow, DealRow,
                        FounderRow, MemoRow, SignalRow, ThesisRow)
from app.schemas import ApplicationFounder, ApplicationPayload
from app.services.pipeline import process_application

MOCKS_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mocks.json")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _resolve_ts(value: str) -> str:
    if value == "__NOW__":
        return _now().isoformat()
    m = re.match(r"^__DEADLINE_([0-9.]+)__$", value or "")
    if m:
        return (_now() + timedelta(hours=float(m.group(1)))).isoformat()
    return value


def seed_baseline(db) -> None:
    with open(MOCKS_PATH) as fh:
        mocks = json.load(fh)

    now_iso = _now().isoformat()
    for f in mocks["FOUNDERS"]:
        db.add(FounderRow(
            id=f["id"], name=f["name"], role=f["role"], email=f["email"],
            linkedin=f.get("linkedin"), github=f.get("github"),
            website=f.get("website"), location=f["location"],
            expertise=f["expertise"], founder_score=f["founderScore"],
            score_trend=f["scoreTrend"], components=f["components"],
            history=f["history"], contact_status=f["contactStatus"],
            contradiction_count=f["contradictionCount"], bio=f["bio"],
            created_at=now_iso))

    for d in mocks["DEALS"]:
        started = _now() - timedelta(hours=d.get("timeInStageHours", 0))
        db.add(DealRow(
            id=d["id"], company=d["company"], tagline=d["tagline"],
            sector=d["sector"], stage=d["stage"], geography=d["geography"],
            source=d["source"], is_cold_start=d.get("isColdStart", False),
            pipeline_stage=d["pipelineStage"], stage_started_at=started.isoformat(),
            next_action=d["nextAction"], verifications=d["verifications"],
            alerts=d["alerts"], links=d["links"], ask_usd=d["askUsd"],
            created_at=_resolve_ts(d["createdAt"]),
            decision_deadline=_resolve_ts(d["decisionDeadline"]),
            starred=False, viable=True, errors=[]))
        for i, fid in enumerate(d["founderIds"]):
            db.add(DealFounderRow(deal_id=d["id"], founder_id=fid, lead=(i == 0)))
        for c in d["claims"]:
            db.add(ClaimRow(
                id=c["id"], deal_id=d["id"], claim=c["claim"], status=c["status"],
                trust_score=c["trustScore"], detail=c["detail"],
                source=c.get("source"), source_url=c.get("sourceUrl"),
                collected_at=c["collectedAt"], verified_at=c.get("verifiedAt"),
                conflicting_evidence=c.get("conflictingEvidence"),
                ai_explanation=c["aiExplanation"],
                review_notes=c.get("reviewNotes", [])))
        db.add(AxisAssessmentRow(
            deal_id=d["id"], founder_axis=d["founderAxis"], market=d["market"],
            idea_vs_market=d["ideaVsMarket"], team_coverage=d["teamCoverage"],
            version=1, created_at=now_iso))
        db.add(MemoRow(deal_id=d["id"], memo_json=d["memo"], version=1,
                       created_at=now_iso))

    # feed inserted oldest-first so the '2m' item gets the highest id (newest)
    for item in reversed(mocks["SOURCING_FEED"]):
        db.add(SignalRow(source=item["source"], signal_type="feed",
                         raw_json={"text": item["text"], "time": item["time"]},
                         fetched_at=now_iso))

    # signals backing Amara's mock track record (consistent with verified claim helix-c2),
    # so the repeat-founder recompute has evidence instead of collapsing her score
    db.add(SignalRow(
        founder_id="amara-okafor", source="GitHub API", signal_type="github_profile",
        raw_json={"handle": "amaraok", "total_stars": 8412, "followers": 12000,
                  "public_repos": 24, "created_at": "2015-06-01T00:00:00Z",
                  "top_repos": [{"name": "helix-core", "stars": 8412,
                                 "description": "Deterministic runtime for multi-agent LLM systems",
                                 "pushed_at": "2026-07-01", "url": "https://github.com/helix-run/helix-core"},
                                {"name": "paystream", "stars": 620,
                                 "description": "OSS payments ledger", "pushed_at": "2025-11-02",
                                 "url": "https://github.com/amaraok/paystream"}]},
        fetched_at=now_iso))

    db.add(ThesisRow(id="ai-infra-us-seed", name="AI Infra US — Seed",
                     sectors=["AI Infra"], stage="Seed", geography=["US"],
                     risk="Moderate", check_size_usd=100000,
                     excluded_sectors=["Crypto"], active=True))
    db.add(ThesisRow(id="european-cold-start-founders", name="European Cold-Start Founders",
                     sectors=["DevTools", "AI Infra", "B2B SaaS"], stage="Pre-Seed",
                     geography=["Europe"], risk="High", check_size_usd=100000,
                     excluded_sectors=[], active=False))
    db.commit()


SYNTHETIC_APPS = [
    # --- 4 normal ---
    ApplicationPayload(
        company="PolyGlot AI", tagline="Realtime speech translation API for contact centers.",
        sector="AI Infra", stage="Seed", geography="US",
        founders=[ApplicationFounder(name="Lena Fischer", role="CEO", email="lena@polyglot.ai"),
                  ApplicationFounder(name="Raj Patel", role="CTO", email="raj@polyglot.ai",
                                     github="https://github.com/rajpatel")],
        links=["https://polyglot.ai"], has_deck=True),
    ApplicationPayload(
        company="Ferrite Labs", tagline="Edge inference runtime for quantized LLMs on ARM devices.",
        sector="AI Infra", stage="Pre-Seed", geography="Europe",
        founders=[ApplicationFounder(name="Jonas Weber", role="CTO", email="jonas@ferrite.dev",
                                     github="https://github.com/jonasweber")],
        links=["https://ferrite.dev"], has_deck=False),
    ApplicationPayload(
        company="CanvasQL", tagline="Notebook-style BI where product teams query in plain SQL + prose.",
        sector="B2B SaaS", stage="Seed", geography="US",
        founders=[ApplicationFounder(name="Priya Nair", role="CEO", email="priya@canvasql.com",
                                     linkedin="https://linkedin.com/in/priyanair")],
        links=["https://canvasql.com"], has_deck=True),
    ApplicationPayload(
        company="Driftwatch", tagline="Model-drift monitoring for regulated ML pipelines (banking, health).",
        sector="B2B SaaS", stage="Seed", geography="Europe",
        founders=[ApplicationFounder(name="Tomas Novak", role="CEO", email="tomas@driftwatch.io",
                                     github="https://github.com/tomasnovak")],
        links=["https://driftwatch.io"], has_deck=False),
    # --- 2 with seeded contradictions (claim vs attached artifact text) ---
    ApplicationPayload(
        company="MetricFlow", tagline="Revenue analytics platform with $1.2M ARR across 40 enterprise customers.",
        sector="B2B SaaS", stage="Seed", geography="US",
        founders=[ApplicationFounder(name="Alex Kim", role="CEO", email="alex@metricflow.io")],
        links=["https://metricflow.io"], has_deck=True,
        cv_text=("Submitted product artifact (status page capture): 'MetricFlow is in "
                 "private beta — request access to join the waitlist.' Pricing page: "
                 "'Free while in beta.' Founder notes: currently pre-revenue, piloting "
                 "with 3 unpaid design partners.")),
    ApplicationPayload(
        company="SecureStack", tagline="SOC 2 Type II certified secrets manager for CI pipelines with 500 paying teams.",
        sector="B2B SaaS", stage="Seed", geography="US",
        founders=[ApplicationFounder(name="Dana Ionescu", role="CEO", email="dana@securestack.dev")],
        links=["https://securestack.dev"], has_deck=True,
        cv_text=("Submitted compliance artifact: 'SOC 2 Type II audit planned for Q3 "
                 "next year; current posture is self-assessed.' Public pricing page "
                 "artifact: 'Free during beta — pricing coming soon.'")),
    # --- 1 cold-start with a strong CV / footprint ---
    ApplicationPayload(
        company="Quiet Systems", tagline="Deterministic local-first sync engine for field teams with intermittent connectivity.",
        sector="DevTools", stage="Pre-Seed", geography="Europe",
        founders=[ApplicationFounder(name="Mara Lindqvist", role="CEO", email="mara@quiet.systems")],
        links=[], has_deck=False,
        cv_text=("Seven years building field-service software for Nordic utilities "
                 "(Vattenfall subcontractor tooling). Designed and shipped an internal "
                 "CRDT-based sync layer used daily by 40 technicians in areas with "
                 "<20% connectivity uptime; cut failed work-order syncs from 14% to "
                 "0.3%. Wrote a 12-part engineering series on convergence guarantees "
                 "vs operational-transform tradeoffs (self-published, cited in the "
                 "Automerge community). No public GitHub — all prior work was "
                 "proprietary. Left in March to build Quiet Systems full-time.")),
    # --- 1 repeat founder: Amara's email, NEW company ---
    ApplicationPayload(
        company="Helix Mesh", tagline="Service-mesh control plane for fleets of Helix Runtime agents.",
        sector="AI Infra", stage="Seed", geography="US",
        founders=[ApplicationFounder(name="Amara Okafor", role="CEO", email="amara@helix.run",
                                     github="https://github.com/amaraok")],
        links=["https://helix.run"], has_deck=True),
]


async def seed_pipeline() -> list:
    results = []
    for payload in SYNTHETIC_APPS:
        db = SessionLocal()
        try:
            deal, matched, _, errors = await process_application(db, payload)
            results.append((deal.id, deal.viable, deal.is_cold_start, matched, errors))
            print("  processed {} -> deal '{}' (viable={}, matched={}, errors={})".format(
                payload.company, deal.id, deal.viable, matched, len(errors)))
        finally:
            db.close()
    return results


def main() -> None:
    print("Resetting database...")
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        print("Seeding baseline mock universe (6+2 deals, 9 founders, feed, theses)...")
        seed_baseline(db)
    finally:
        db.close()
    print("Pushing {} synthetic applications through the real pipeline...".format(len(SYNTHETIC_APPS)))
    asyncio.run(seed_pipeline())

    print("\n=== DEMO CHEAT-SHEET ===")
    print("Contradiction demo:   deals 'metricflow' and 'securestack' (claim vs artifact)")
    print("Cold-start demo:      deal 'quiet-systems' (footprint assessment, wider uncertainty)")
    print("Repeat-founder demo:  deal 'helix-mesh' — founder 'amara-okafor' (2 projects, history event, prior-company bonus)")
    print("Baseline mock deals:  helix, quantex, loom, voyager, northgrid, brickline, mendel, loom-notebook")
    print("Active thesis:        'AI Infra US — Seed' (ai-infra-us-seed)")


if __name__ == "__main__":
    main()
