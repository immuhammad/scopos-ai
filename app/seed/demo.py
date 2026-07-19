"""Fresh justified demo dataset — every record exists to demonstrate a rubric
rule or demo beat (see docs/DATA.md). All content flows through REAL pipeline
paths; fixture companies are labeled synthetic but every score/claim/memo is a
genuine pipeline output.
    python -m app.seed.demo
"""
import asyncio
import json
import os
from datetime import datetime, timezone

from sqlalchemy import select

from app.db import Base, SessionLocal, engine, init_db
from app.models import AuditTrailRow, DealRow, ThesisRow
from app.schemas import ApplicationFounder, ApplicationPayload
from app.seed.vary_trends import main as vary_trends_main
from app.services.feedback import store_feedback
from app.services.ingest_github import ingest_github
from app.services.ingest_hn import ingest_hn
from app.services.pipeline import active_thesis, process_application

MOCKS_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mocks.json")
FIXTURE_IDS = ["helix", "quantex", "loom", "voyager", "northgrid", "brickline", "mendel"]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _fixture_payload(mock: dict, founders_by_id: dict) -> ApplicationPayload:
    deck_lines = [mock["tagline"], mock["memo"]["problemProduct"]]
    for c in mock["claims"]:
        deck_lines.append(c["claim"].rstrip(".") + ".")
    artifact_lines = [c["conflictingEvidence"].rstrip(".") + "."
                      for c in mock["claims"] if c.get("conflictingEvidence")]
    cv_text = None
    if artifact_lines:
        cv_text = ("LIVE ARTIFACT SCAN (third-party evidence collected by the platform — "
                   "these are NOT founder statements):\n" + "\n".join(artifact_lines))
    founders = []
    for fid in mock["founderIds"]:
        f = founders_by_id[fid]
        founders.append(ApplicationFounder(
            name=f["name"], role=f["role"], email=f["email"],
            linkedin=f.get("linkedin"), github=f.get("github")))
    links = [l["href"] for l in mock["links"] if l.get("href")]
    return ApplicationPayload(
        company=mock["company"], tagline=mock["tagline"], sector=mock["sector"],
        stage=mock["stage"], geography=mock["geography"], founders=founders,
        links=links[:4], has_deck=True, deck_text="\n".join(deck_lines),
        cv_text=cv_text, ask_usd=mock.get("askUsd", 100000))


PURPOSE_APPS = [
    ApplicationPayload(
        company="PolyGlot AI", tagline="Realtime speech translation API for contact centers.",
        sector="AI Infra", stage="Seed", geography="US", ask_usd=100000,
        founders=[ApplicationFounder(name="Lena Fischer", role="CEO", email="lena@polyglot.ai"),
                  ApplicationFounder(name="Raj Patel", role="CTO", email="raj@polyglot.ai",
                                     github="https://github.com/rajpatel")],
        links=["https://polyglot.ai"], has_deck=True,
        deck_text=("PolyGlot AI provides realtime speech translation for contact centers.\n"
                   "We serve 6 pilot contact centers across the US.\n"
                   "Median translation latency is under 400 milliseconds.\n"
                   "The team previously built speech infrastructure at Twilio.")),
    ApplicationPayload(
        company="MetricFlow", tagline="Revenue analytics platform with $1.2M ARR across 40 enterprise customers.",
        sector="B2B SaaS", stage="Seed", geography="US", ask_usd=100000,
        founders=[ApplicationFounder(name="Alex Kim", role="CEO", email="alex@metricflow.io")],
        links=["https://metricflow.io"], has_deck=True,
        cv_text=("LIVE ARTIFACT SCAN (third-party evidence collected by the platform — these "
                 "are NOT founder statements):\nMetricFlow is in private beta — request access "
                 "to join the waitlist.\nPricing page: Free while in beta.\nCurrently "
                 "pre-revenue, piloting with 3 unpaid design partners.")),
    ApplicationPayload(
        company="SecureStack", tagline="SOC 2 Type II certified secrets manager for CI pipelines with 500 paying teams.",
        sector="B2B SaaS", stage="Seed", geography="US", ask_usd=100000,
        founders=[ApplicationFounder(name="Dana Ionescu", role="CEO", email="dana@securestack.dev")],
        links=["https://securestack.dev"], has_deck=True,
        cv_text=("LIVE ARTIFACT SCAN (third-party evidence collected by the platform — these "
                 "are NOT founder statements):\nSOC 2 Type II audit planned for Q3 next year; "
                 "current posture is self-assessed.\nPublic pricing page: Free during beta — "
                 "pricing coming soon.")),
    ApplicationPayload(
        company="Quiet Systems", tagline="Deterministic local-first sync engine for field teams with intermittent connectivity.",
        sector="DevTools", stage="Pre-Seed", geography="Europe", ask_usd=100000,
        founders=[ApplicationFounder(name="Mara Lindqvist", role="CEO", email="mara@quiet.systems")],
        links=[], has_deck=False,
        cv_text=("Seven years building field-service software for Nordic utilities "
                 "(Vattenfall subcontractor tooling). Designed and shipped an internal "
                 "CRDT-based sync layer used daily by 40 technicians in areas with <20% "
                 "connectivity uptime; cut failed work-order syncs from 14% to 0.3%. Wrote a "
                 "12-part engineering series on convergence guarantees vs operational-transform "
                 "tradeoffs (self-published, cited in the Automerge community). No public "
                 "GitHub — all prior work was proprietary.")),
    ApplicationPayload(
        company="Fieldnote Bio", tagline="Structured lab-notebook software for small biotech wet labs.",
        sector="B2B SaaS", stage="Pre-Seed", geography="US", ask_usd=100000,
        founders=[ApplicationFounder(name="June Okonkwo", role="CEO", email="june@fieldnote.bio")],
        links=[], has_deck=False,
        cv_text=("Bench scientist for six years at two Boston biotechs (protein purification, "
                 "assay development). Built the lab's internal sample-tracking spreadsheet "
                 "system used by 30 scientists daily; documented 200+ SOPs. Wrote a widely "
                 "shared essay series on why ELNs fail bench scientists — specific, "
                 "process-level detail on capture friction. No prior startup, no public code; "
                 "deep domain access to 12 small labs committed to pilot interviews.")),
    ApplicationPayload(
        company="Helix Mesh", tagline="Service-mesh control plane for fleets of Helix Runtime agents.",
        sector="AI Infra", stage="Seed", geography="US", ask_usd=100000,
        founders=[ApplicationFounder(name="Amara Okafor", role="CEO", email="amara@helix.run",
                                     github="https://github.com/amaraok")],
        links=["https://helix.run"], has_deck=True,
        deck_text=("Helix Mesh is a service-mesh control plane for fleets of Helix Runtime "
                   "agents.\nBuilt by the founding team of Helix Runtime.\nAlready validated "
                   "with two Helix Runtime design partners running multi-agent fleets.")),
]


async def main() -> None:
    print("Wiping database…")
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    init_db()

    db = SessionLocal()
    try:
        db.add(ThesisRow(id="ai-infra-us-seed", name="AI Infra US — Seed",
                         sector="AI Infra", geo="US", stage="Seed", risk="Balanced",
                         check_size=100000, check_size_usd=100000,
                         sectors=["AI Infra"], geography=["US"],
                         excluded_sectors=["Crypto"], active=True,
                         ownership_target_pct=10.0, created_at=_now_iso()))
        db.add(ThesisRow(id="european-cold-start-founders", name="European Cold-Start Founders",
                         sector="DevTools", geo="Europe", stage="Pre-Seed", risk="Aggressive",
                         check_size=100000, check_size_usd=100000,
                         sectors=["DevTools"], geography=["Europe"],
                         excluded_sectors=[], active=False,
                         ownership_target_pct=12.0, created_at=_now_iso()))
        db.commit()

        with open(MOCKS_PATH) as fh:
            mocks = json.load(fh)
        founders_by_id = {f["id"]: f for f in mocks["FOUNDERS"]}
        deals_by_id = {d["id"]: d for d in mocks["DEALS"]}

        print("Seeding {} fixture companies through the REAL pipeline…".format(len(FIXTURE_IDS)))
        for fid in FIXTURE_IDS:
            payload = _fixture_payload(deals_by_id[fid], founders_by_id)
            deal, matched, _, errors = await process_application(db, payload)
            print("  {} → {} (matched={}, errors={})".format(fid, deal.id, matched, len(errors)))

        print("Seeding {} purpose deals…".format(len(PURPOSE_APPS)))
        for payload in PURPOSE_APPS:
            deal, matched, _, errors = await process_application(db, payload)
            print("  {} → {} (matched={}, errors={})".format(
                payload.company, deal.id, matched, len(errors)))
    finally:
        db.close()

    print("Trend variety — follow-up artifacts + real reassessment…")
    await vary_trends_main()

    db = SessionLocal()
    try:
        print("Live outbound leads…")
        hn = await ingest_hn(db, process_limit=4)
        print("  HN: {} leads {}".format(len(hn["dealIds"]), hn["dealIds"]))
        gh = await ingest_github(db, process_limit=3)
        print("  GitHub: {} leads {}".format(len(gh["dealIds"]), gh["dealIds"]))

        # Wishlist: one high-conviction (pending — helix-runtime gets decided below,
        # so its sibling helix-mesh carries the visible wishlist slot), one
        # cold-start-high-upside, one outbound lead
        stars = ["helix-mesh", "quiet-systems"]
        if hn["dealIds"]:
            stars.append(hn["dealIds"][0])
        elif gh["dealIds"]:
            stars.append(gh["dealIds"][0])
        for did in stars:
            deal = db.get(DealRow, did)
            if deal is not None:
                deal.starred = True
        db.commit()
        print("  starred: {}".format(stars))

        # Decisions: one approve, one decline whose note contradicts the rec (feedback loop)
        def decide(deal_id: str, kind: str, note: str, label: str) -> None:
            deal = db.get(DealRow, deal_id)
            if deal is None:
                return
            deal.pipeline_stage = "Approved" if kind.startswith("approve") else "Declined"
            deal.stage_started_at = _now_iso()
            deal.decided_at = _now_iso()
            deal.next_action = "Simulated decision recorded: {}. No external action was taken.".format(kind)
            db.add(AuditTrailRow(deal_id=deal_id, decision=kind, note=note,
                                 conditions=None, timestamp=_now_iso(),
                                 actor="Analyst", analysis_label=label))
            if kind == "decline":
                store_feedback(db, deal_id, kind, note, active_thesis(db))
            db.commit()

        decide("helix-runtime", "approve",
               "Strongest team-in-context in the funnel; verified pilot revenue and a repeat "
               "technical founder. Simulated $100K check.",
               "Simulated investment decision")
        decide("brickline", "decline",
               "Declining despite a reasonable read: vertical SaaS GTM here is too "
               "capital-intensive for our $100K first-check model — prefer product-led "
               "motions in this thesis.",
               "Simulated decline")
        print("  decided: helix-runtime (approve), brickline (decline → feedback stored)")
    finally:
        db.close()

    print("\n=== Demo dataset ready — see docs/DATA.md for the justification table ===")


if __name__ == "__main__":
    asyncio.run(main())
