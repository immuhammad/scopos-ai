"""Smoke tests from docs/03 — run against a live server: python scripts/smoke_test.py
Assumes `python -m app.seed.run` has completed and uvicorn is serving on BASE."""
import json
import os
import subprocess
import sys
import time

import httpx

BASE = os.getenv("SMOKE_BASE", "http://127.0.0.1:8000")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
client = httpx.Client(base_url=BASE, timeout=600)
RESULTS = []


def check(name, ok, detail=""):
    RESULTS.append((name, bool(ok), detail))
    print("{} {} {}".format("PASS" if ok else "FAIL", name, detail if not ok else ""))


def warn(name, detail):
    print("WARN {} {}".format(name, detail))


BASELINE = ["helix", "quantex", "loom", "voyager", "northgrid", "brickline"]
FORBIDDEN_AVG_KEYS = {"overallScore", "compositeScore", "averageScore", "totalScore", "score"}


def t1_health_and_deals():
    r = client.get("/health")
    check("1a /health 200", r.status_code == 200 and r.json().get("status") == "ok")
    r = client.get("/deals")
    check("1b GET /deals 200", r.status_code == 200)
    deals = r.json()
    ids = {d["id"] for d in deals}
    check("1c baseline deals present", all(b in ids for b in BASELINE),
          "missing: {}".format([b for b in BASELINE if b not in ids]))
    d0 = deals[0]
    check("1d camelCase fields", all(k in d0 for k in
          ("founderAxis", "pipelineStage", "askUsd", "ideaVsMarket", "timeInStageHours",
           "nextAction", "founderIds", "decisionDeadline")))
    check("1e no averaged single score", all(
        not (set(d) & FORBIDDEN_AVG_KEYS) for d in deals))
    return deals


def t2_application():
    payload = {"company": "Lumen Robotics",
               "tagline": "Computer-vision QA for small-batch electronics manufacturing lines.",
               "founders": [{"name": "Sara Holt", "role": "CEO", "email": "sara@lumenrobotics.dev"}],
               "links": [], "hasDeck": False}
    r = client.post("/applications", json=payload)
    check("2a POST /applications 200", r.status_code == 200, r.text[:300])
    if r.status_code != 200:
        return None
    body = r.json()
    deal_id = body["dealId"]
    if not body.get("viable", True) or body.get("deal") is None:
        check("2b-f application viable", False,
              "filtered as non-viable; deal payload null (viable={})".format(body.get("viable")))
        return None
    deals = client.get("/deals").json()
    check("2b new deal in GET /deals", any(d["id"] == deal_id for d in deals))
    deal = body["deal"]
    fa, mk, iv = deal["founderAxis"], deal["market"], deal["ideaVsMarket"]
    check("2c founderAxis keys", set(fa) == {"score", "trend", "summary", "note"}, str(set(fa)))
    check("2d market has rating, NO score",
          set(mk) == {"rating", "trend", "tam", "summary", "competitors"}, str(set(mk)))
    check("2e ideaVsMarket keys", set(iv) == {"score", "trend", "verdict", "flexibility"}, str(set(iv)))
    check("2f claims trustScore ints", all(isinstance(c["trustScore"], int) for c in deal["claims"]))
    r2 = client.post("/applications", json={
        "company": "Lumen Robotics Cloud",
        "tagline": "Hosted dashboard companion to Lumen Robotics line-QA cameras.",
        "founders": [{"name": "Sara Holt", "role": "CEO", "email": "SARA@lumenrobotics.dev"}],
        "links": [], "hasDeck": False})
    check("2g founder deduped by email (case-insens)",
          r2.status_code == 200 and len(r2.json()["matchedFounderIds"]) == 1,
          r2.text[:200])
    return deal_id


def t3_contradiction():
    ok_any = False
    for did in ("metricflow", "securestack"):
        r = client.get("/deals/{}".format(did))
        if r.status_code != 200:
            continue
        deal = r.json()
        bad = [c for c in deal["claims"] if c["status"] == "contradicted" and c["trustScore"] <= 30]
        risks = " ".join(deal["memo"]["swot"]["risks"]).lower()
        if bad and deal["alerts"] > 0 and risks:
            ok_any = True
            check("3 contradiction deal '{}'".format(did),
                  any(w in risks for w in bad[0]["claim"].lower().split()[:4]) or "contradict" in risks,
                  "risks: {}".format(risks[:200]))
            break
    if not ok_any:
        check("3 contradiction seeded deal", False, "no contradicted claim <=30 with alerts>0 found")


def t4_cold_start():
    r = client.get("/deals/quiet-systems")
    check("4a cold-start deal exists", r.status_code == 200)
    if r.status_code != 200:
        return
    deal = r.json()
    check("4b isColdStart true", deal.get("isColdStart") is True)
    note = deal["founderAxis"]["note"].lower()
    check("4c uncertainty language in founderAxis.note",
          any(w in note for w in ("uncertain", "confidence interval", "wider")), note[:200])
    fid = deal["founderIds"][0]
    f = client.get("/founders/{}".format(fid)).json()
    check("4d footprint component present",
          any("footprint" in c["label"].lower() for c in f["components"]),
          str(f["components"]))


def t5_repeat_founder():
    r = client.get("/founders/amara-okafor")
    check("5a amara exists (single record)", r.status_code == 200)
    f = r.json()
    check("5b projects length 2", len(f["projects"]) == 2, str(f["projects"]))
    check("5c new history event appended", len(f["history"]) >= 6 and
          "Helix Mesh" in f["history"][-1]["event"], str(f["history"][-1:]))
    check("5d prior-company bonus component",
          any("prior company" in c["label"].lower() for c in f["components"]),
          str(f["components"]))
    founders = client.get("/founders").json()
    amaras = [x for x in founders if x["email"].lower() == "amara@helix.run"]
    check("5e no duplicate founder record", len(amaras) == 1)


def t6_memo():
    memo = client.get("/deals/helix/memo").json()
    check("6a memo has all 5 sections", all(k in memo for k in
          ("snapshot", "hypotheses", "swot", "problemProduct", "traction")), str(list(memo)))
    found = False
    for did in ("metricflow", "quiet-systems", "helix"):
        r = client.get("/deals/{}/memo".format(did))
        if r.status_code != 200:
            continue
        blob = json.dumps(r.json()).lower()
        if "not disclosed" in blob or "unavailable" in blob:
            found = True
            break
    check("6b at least one 'Not disclosed'", found)


def t7_decide(smoke_deal_id):
    did = smoke_deal_id or "brickline"
    r = client.post("/deals/{}/decide".format(did), json={"decision": "continue_diligence"})
    check("7a decide without note -> 422", r.status_code == 422, str(r.status_code))
    r = client.post("/deals/{}/decide".format(did),
                    json={"decision": "continue_diligence", "note": "smoke test decision"})
    ok = r.status_code == 200
    deal = r.json() if ok else {}
    check("7b decide with note updates stage + audit",
          ok and deal["pipelineStage"] == "Diligence" and deal.get("auditTrail"),
          r.text[:200])


def t8_search():
    r = client.post("/search", json={
        "query": "AI infra founders in the US at seed stage with strong open-source traction"})
    check("8a search 200", r.status_code == 200, r.text[:200])
    if r.status_code != 200:
        return
    body = r.json()
    check("8b criteria chips", len(body["criteria"]) >= 1, str(body["criteria"]))
    check("8c >=1 deal match with why/missing",
          len(body["deals"]) >= 1 and "why" in body["deals"][0] and "missing" in body["deals"][0],
          str(body["deals"][:1]))


def t9_ingest():
    r = client.post("/ingest/hn", params={"limit": 1})
    ok = r.status_code == 200
    body = r.json() if ok else {}
    if ok and body.get("errors") and body.get("newSignals", 0) == 0:
        # network failure path: clean JSON error, not a 500 — still a pass
        warn("9 ingest/hn", "network unavailable, degraded cleanly: {}".format(body["errors"][:1]))
        check("9 ingest/hn clean response", True)
    else:
        check("9 ingest/hn creates signals", ok and body.get("newSignals", 0) >= 1, r.text[:300])


def t10_briefing():
    r = client.post("/deals/helix/briefing")
    check("10a briefing 200", r.status_code == 200, r.text[:200])
    if r.status_code != 200:
        return
    body = r.json()
    check("10b transcript + chapters", bool(body["transcript"]) and len(body["chapters"]) >= 4)
    if body.get("audioUrl"):
        ar = client.get(body["audioUrl"])
        check("10c audio served", ar.status_code == 200 and len(ar.content) > 1000)
    else:
        has_key = bool(os.getenv("ELEVENLABS_API_KEY"))
        if has_key:
            warn("10c", "ELEVENLABS key set but audioUrl null (TTS degraded gracefully)")
        check("10c audioUrl null without working TTS", body["audioUrl"] is None)


def t11_bad_openai_key():
    env = dict(os.environ)
    env["OPENAI_API_KEY"] = "sk-invalid-smoke-key"
    proc = subprocess.Popen(
        [os.path.join(ROOT, ".venv", "bin", "python"), "-m", "uvicorn",
         "app.main:app", "--port", "8001"],
        cwd=ROOT, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        up = False
        with httpx.Client(base_url="http://127.0.0.1:8001", timeout=300) as c2:
            for _ in range(30):
                try:
                    if c2.get("/health", timeout=2).status_code == 200:
                        up = True
                        break
                except Exception:
                    time.sleep(1)
            if not up:
                check("11 degraded server boots", False, "server on :8001 never came up")
                return
            r = c2.post("/applications", json={
                "company": "Degraded Path Co",
                "founders": [{"name": "Deg Raded", "role": "CEO", "email": "deg@raded.dev"}],
                "links": [], "hasDeck": False})
            body = r.json() if r.status_code == 200 else {}
            check("11 bad OPENAI key -> structured degraded 200, not crash",
                  r.status_code == 200 and len(body.get("errors", [])) >= 1,
                  "status={} errors={}".format(r.status_code, body.get("errors", [])[:2]))
    finally:
        proc.terminate()


def _assert_keys(mock, resp, path, missing):
    if isinstance(mock, dict):
        if not isinstance(resp, dict):
            missing.append("{} (not an object)".format(path))
            return
        for k, v in mock.items():
            if k not in resp:
                missing.append("{}.{}".format(path, k))
            else:
                _assert_keys(v, resp[k], "{}.{}".format(path, k), missing)
    elif isinstance(mock, list) and mock and isinstance(resp, list) and resp:
        _assert_keys(mock[0], resp[0], path + "[0]", missing)


def t12_contract_keys():
    with open(os.path.join(ROOT, "app", "seed", "mocks.json")) as fh:
        mock_deal = [d for d in json.load(fh)["DEALS"] if d["id"] == "helix"][0]
    resp = client.get("/deals/helix").json()
    missing = []
    _assert_keys(mock_deal, resp, "deal", missing)
    check("12 every mock Deal key present in response", not missing, str(missing[:10]))


def t13_env_not_committed():
    out = subprocess.run(["git", "ls-files", ".env"], cwd=ROOT,
                         capture_output=True, text=True).stdout.strip()
    check("13 .env not committed", out == "", out)


def main():
    deals = t1_health_and_deals()  # noqa: F841
    smoke_deal = t2_application()
    t3_contradiction()
    t4_cold_start()
    t5_repeat_founder()
    t6_memo()
    t7_decide(smoke_deal)
    t8_search()
    t9_ingest()
    t10_briefing()
    t11_bad_openai_key()
    t12_contract_keys()
    t13_env_not_committed()

    failed = [r for r in RESULTS if not r[1]]
    print("\n=== {} passed, {} failed ===".format(
        len(RESULTS) - len(failed), len(failed)))
    for name, _, detail in failed:
        print("FAILED: {} {}".format(name, detail))
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
