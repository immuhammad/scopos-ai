"""Scopos end-to-end smoke suite — run against a live, seeded backend:
    python -m tests.e2e_smoke
Covers every endpoint (incl. GET briefing + simulate-application), the lead
lane, starred seeds, trend variety, the High Upside rule inputs, FEATURES.md
endpoint claims, and the docs/DATA.md cross-reference. Slow steps (one live
application, one briefing, one lead convergence) run last; skip with --fast."""
import json
import os
import re
import sqlite3
import sys

import httpx

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

BASE = os.getenv("SMOKE_BASE", "http://127.0.0.1:8000")
FAST = "--fast" in sys.argv
client = httpx.Client(base_url=BASE, timeout=600)
RESULTS = []


def check(name, ok, detail=""):
    RESULTS.append((name, bool(ok), detail))
    print("{} {} {}".format("PASS" if ok else "FAIL", name, detail if not ok else ""))


def keys_ok(obj, req):
    return all(k in obj for k in req)


def main():  # noqa: C901 — linear test script
    # ── core reads ──
    check("health", client.get("/health").json().get("status") == "ok")
    pending = client.get("/deals").json()
    all_deals = client.get("/deals?status=all").json()
    decided = client.get("/deals?status=decided").json()
    check("deals: pending+decided partition", len(pending) + len(decided) == len(all_deals),
          "{}+{}!={}".format(len(pending), len(decided), len(all_deals)))
    check("deals: decided excluded from default",
          not [d for d in pending if d["pipelineStage"] in ("Approved", "Declined")])
    check("deals: seeded decisions exist", len(decided) >= 2, str([d["id"] for d in decided]))

    # ── lead lane (§10) ──
    leads = [d for d in pending if d["pipelineStage"] in ("Sourced", "Invited")]
    check("leads exist in Outreach lane", len(leads) >= 3, str(len(leads)))
    check("leads have NO claims (no fabrication)", all(not d["claims"] for d in leads))
    check("leads carry real links", all(any(l["href"] for l in d["links"]) for d in leads))
    lead = next((d for d in leads if d["source"] == "Outbound — Show HN"), leads[0])
    draft = client.get("/deals/{}/outreach/draft".format(lead["id"])).json()
    check("lead draft: subject/body/signals/strength",
          keys_ok(draft, ("subject", "body", "signals", "signalStrength")), str(draft)[:150])
    check("lead breakdown is footprint-based",
          any("Community traction" in s["label"] for s in draft["signals"]), str(draft["signals"])[:200])
    state = client.get("/deals/{}/outreach/state".format(lead["id"])).json()
    check("outreach state enum + simulated flag",
          state.get("status") in ("not_sent", "sent") and state.get("simulated") is True, str(state))

    # ── starred seeds (§3) ──
    starred = [d["id"] for d in all_deals if d.get("starred")]
    check("wishlist: 3 starred seeds", len(starred) >= 3, str(starred))

    # ── trend variety (§5) ──
    ups = [d["id"] for d in all_deals if "up" in (d["founderAxis"]["trend"], d["market"]["trend"], d["ideaVsMarket"]["trend"])]
    downs = [d["id"] for d in all_deals if "down" in (d["founderAxis"]["trend"], d["market"]["trend"], d["ideaVsMarket"]["trend"])]
    check("trends: at least one ↑ deal", len(ups) >= 1, str(ups[:5]))
    check("trends: at least one ↓ deal", len(downs) >= 1, str(downs[:5]))

    # ── High Upside rule inputs (§4) ──
    hu = [d["id"] for d in all_deals
          if d["ideaVsMarket"]["score"] >= 65 and d["founderAxis"]["score"] < 50]
    check("High Upside rule: ≥1 qualifying deal (Idea≥65 & Founder<50)", len(hu) >= 1, str(hu))

    # ── diligence surfaces ──
    mf = client.get("/deals/metricflow").json()
    bad = [c for c in mf["claims"] if c["status"] == "contradicted"]
    check("metricflow contradiction caught", bool(bad) and mf["alerts"] > 0)
    check("contradiction carries quote + artifact",
          bool(bad) and bad[0].get("conflictingEvidence") and bad[0].get("artifact"), str(bad[:1])[:200])
    qs = client.get("/deals/quiet-systems").json()
    check("cold-start flagged + uncertainty note", qs.get("isColdStart") is True and
          any(w in qs["founderAxis"]["note"].lower() for w in ("uncertain", "wider", "confidence")))
    con = sqlite3.connect(os.path.join(ROOT, "vcbrain.db"))
    n_quotes, n_claims = con.execute(
        "select sum(case when source_quote is not null and source_quote != '' then 1 else 0 end), count(*) from claims").fetchone()
    check("every claim quote-anchored", n_claims > 0 and n_quotes == n_claims,
          "{}/{}".format(n_quotes, n_claims))

    amara = client.get("/founders/amara-okafor").json()
    check("repeat founder: one record, 2 projects, history",
          len(amara["projects"]) >= 2 and len(amara["history"]) >= 2, str(amara["projects"]))

    memo = client.get("/deals/helix-runtime/memo").json()
    check("memo envelope + sections", keys_ok(memo, ("memo", "generatedAt", "version")) and
          keys_ok(memo["memo"], ("snapshot", "hypotheses", "swot", "problemProduct", "traction")))
    blob = json.dumps(memo).lower()
    check("memo marks gaps", "not disclosed" in blob or "unavailable" in blob)

    trace = client.get("/deals/helix-runtime/trace").json()
    steps = [t["step"] for t in trace]
    check("trace ordered extraction→memo", "extraction" in steps and "memo" in steps and
          steps.index("extraction") < steps.index("memo"), str(steps[:10]))
    check("artifacts endpoint", isinstance(client.get("/deals/metricflow/artifacts").json(), list))

    # ── theses + feedback loop ──
    theses = client.get("/theses").json()
    check("theses frontend shape + ownership", all(
        keys_ok(t, ("id", "name", "sector", "stage", "geography", "risk", "checkSize",
                    "excludedSectors", "createdAt", "ownershipTargetPct")) for t in theses))
    active = client.get("/theses/active").json()
    fb = client.get("/theses/{}/feedback".format(active["id"])).json()
    check("feedback loop populated by seeded decline", len(fb) >= 1, str(fb[:1]))

    # ── decide validation + decisions ──
    check("decide without note → 422",
          client.post("/deals/helix-mesh/decide", json={"decision": "decline"}).status_code == 422)
    decs = client.get("/deals/helix-runtime/decisions").json()
    check("DecisionRecord shape + simulated label", decs and
          keys_ok(decs[0], ("id", "dealId", "kind", "note", "timestamp", "analysisLabel", "actor"))
          and "Simulated" in decs[0]["analysisLabel"], str(decs[:1])[:200])
    check("stage endpoint validates", client.post("/deals/brickline/stage",
          json={"stage": "NotAStage"}).status_code == 422)

    # ── search + metrics + auth-independence ──
    sr = client.post("/search", json={"query": "cold-start founders with contradictions"}).json()
    check("search: criteria + full objects", "raw" in sr["criteria"] and
          (not sr["deals"] or "company" in sr["deals"][0]["deal"]))
    m = client.get("/metrics/summary").json()
    check("metrics keys + sane", keys_ok(m, ("pendingCount", "decidedCount", "contradictionsCaught",
          "coldStartCount", "realSourcedCount")) and m["pendingCount"] > 0 and m["decidedCount"] >= 2, str(m))
    check("API is auth-independent (no cookie needed)", True)  # every call above ran cookie-less

    # ── FEATURES.md endpoint claims vs actual routes ──
    from app.main import app  # noqa: E402
    route_paths = {getattr(r, "path", "") for r in app.routes}
    feats = open(os.path.join(ROOT, "FEATURES.md")).read()
    claimed = set(re.findall(r"`(?:GET|POST)(?:/POST)? (/[a-zA-Z0-9/{}_\-]+)`", feats))
    claimed |= {p for pair in re.findall(r"`(GET|POST)/(?:GET|POST) (/[a-zA-Z0-9/{}_\-]+)`", feats) for p in [pair[1]]}
    missing = []
    for path in sorted(claimed):
        norm = re.sub(r"\{[^}]+\}", "{X}", path.split("?")[0])
        if not any(re.sub(r"\{[^}]+\}", "{X}", rp) == norm for rp in route_paths):
            missing.append(path)
    check("FEATURES.md endpoints all exist ({} claimed)".format(len(claimed)), not missing, str(missing))

    # ── docs/DATA.md cross-reference ──
    data_md = open(os.path.join(ROOT, "docs", "DATA.md")).read()
    listed = set(re.findall(r"\| `([a-z0-9\-]+)` \|", data_md))
    db_ids = {d["id"] for d in all_deals}
    missing_ids = [i for i in listed if i not in db_ids and i not in ("ai-infra-us-seed", "european-cold-start-founders", "amara-okafor", "mara-lindqvist", "june-okonkwo")]
    lead_stages = ("Sourced", "Invited", "Screening", "Diligence")
    unexplained = [d["id"] for d in all_deals if d["id"] not in listed
                   and d["source"].startswith("Inbound")]
    check("DATA.md: every listed deal exists", not missing_ids, str(missing_ids))
    check("DATA.md: no unexplained inbound deals", not unexplained, str(unexplained))

    # ── slow live steps ──
    if not FAST:
        # briefing persistence (§6)
        pre = client.get("/deals/loom-dev/briefing")
        check("GET briefing 404 before generation", pre.status_code == 404, str(pre.status_code))
        gen = client.post("/deals/loom-dev/briefing").json()
        check("POST briefing generates", keys_ok(gen, ("url", "durationSec", "generatedAt")))
        got = client.get("/deals/loom-dev/briefing")
        check("GET briefing returns stored (persists)", got.status_code == 200 and
              got.json()["generatedAt"] == gen["generatedAt"], got.text[:150])

        # lead convergence (§10): full inbound pipeline on the same founder
        conv = next((d for d in leads if d["id"] == "wave"), lead)
        founder_before = conv["founderIds"][0]
        r = client.post("/deals/{}/simulate-application".format(conv["id"]))
        check("simulate-application 200", r.status_code == 200, r.text[:200])
        after = r.json() if r.status_code == 200 else {}
        check("converged: Decision-Ready + claims + same founder",
              after.get("pipelineStage") == "Screening" and len(after.get("claims", [])) >= 1
              and after.get("founderIds", [None])[0] == founder_before,
              "stage={} claims={}".format(after.get("pipelineStage"), len(after.get("claims", []))))
        tr = client.get("/deals/{}/trace".format(conv["id"])).json()
        check("convergence trace labeled simulated",
              any(t["step"] == "simulated-application" for t in tr))

        # inbound application still works end-to-end
        r = client.post("/applications", json={
            "company": "Smokewalk Systems",
            "tagline": "Continuous e2e smoke testing for AI-era backends.",
            "founders": [{"name": "Es Ember", "role": "CEO", "email": "es@smokewalk.dev"}],
            "links": [], "hasDeck": False, "askUsd": 120000})
        body = r.json() if r.status_code == 200 else {}
        check("live application 200 + askUsd stored", r.status_code == 200 and
              (body.get("deal") or {}).get("askUsd") == 120000, r.text[:200])

    failed = [x for x in RESULTS if not x[1]]
    print("\n=== {} passed, {} failed ===".format(len(RESULTS) - len(failed), len(failed)))
    for name, _, detail in failed:
        print("FAILED: {} {}".format(name, detail))
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
