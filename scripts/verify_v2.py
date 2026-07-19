"""V2 verification block — run against a live server after reprocess:
    .venv/bin/python scripts/verify_v2.py
Covers the 9 checks from the conformance spec. Exits non-zero on failure."""
import base64
import json
import os
import sqlite3
import sys

import httpx

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.services.textmatch import quote_in_text  # noqa: E402

BASE = os.getenv("SMOKE_BASE", "http://127.0.0.1:8000")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
client = httpx.Client(base_url=BASE, timeout=600)
RESULTS = []


def check(name, ok, detail=""):
    RESULTS.append((name, bool(ok), detail))
    print("{} {} {}".format("PASS" if ok else "FAIL", name, detail if not ok else ""))


def keys_ok(obj, required):
    return all(k in obj for k in required)


# ---- 1. contract surface: every api.ts method → endpoint + shape ----

def t1_contract_surface():
    deals = client.get("/deals").json()
    check("1a listDeals", isinstance(deals, list) and len(deals) > 5)
    with open(os.path.join(ROOT, "app", "seed", "mocks.json")) as fh:
        mock_deal = [d for d in json.load(fh)["DEALS"] if d["id"] == "helix"][0]
    resp = client.get("/deals/helix").json()
    missing = []
    _assert_keys(mock_deal, resp, "deal", missing)
    check("1b getDeal recursive Deal keys", not missing, str(missing[:8]))

    r = client.post("/deals/helix/star", json={"starred": False})
    check("1c starDeal", r.status_code == 200)

    r = client.post("/deals/brickline/stage",
                    json={"stage": "Screening", "nextAction": "verify-v2 stage check"})
    check("1d setDealStage valid", r.status_code == 200 and
          r.json()["pipelineStage"] == "Screening", r.text[:200])
    r = client.post("/deals/brickline/stage", json={"stage": "NotAStage"})
    check("1e setDealStage invalid → 422", r.status_code == 422)

    env = client.get("/deals/helix/memo").json()
    check("1f memo envelope", keys_ok(env, ("memo", "generatedAt", "version")) and
          keys_ok(env["memo"], ("snapshot", "hypotheses", "swot", "problemProduct", "traction")),
          str(list(env)))

    b = client.post("/deals/helix/briefing").json()
    check("1g briefing {url, durationSec, generatedAt}",
          keys_ok(b, ("url", "durationSec", "generatedAt", "transcript", "chapters")) and
          b["durationSec"] > 0, str({k: b.get(k) for k in ("url", "durationSec")}))
    if b.get("url"):
        check("1h briefing url absolute + playable",
              b["url"].startswith("http") and client.get(b["url"]).status_code == 200, b["url"])

    theses = client.get("/theses").json()
    tkeys = ("id", "name", "sector", "stage", "geography", "risk", "checkSize",
             "excludedSectors", "createdAt", "ownershipTargetPct")
    check("1i theses frontend shape", theses and all(keys_ok(t, tkeys) for t in theses),
          str(theses[:1]))
    check("1j thesis risk enum", all(t["risk"] in ("Conservative", "Balanced", "Aggressive")
                                     for t in theses), str([t["risk"] for t in theses]))
    active = client.get("/theses/active").json()
    check("1k getActiveThesis", keys_ok(active, tkeys), str(active)[:150])
    saved = client.post("/theses", json={
        "name": "verify-v2 thesis", "sector": "DevTools", "stage": "Pre-Seed",
        "geography": "Europe", "risk": "Aggressive", "checkSize": 100000,
        "excludedSectors": [], "ownershipTargetPct": 12.5}).json()
    check("1l saveThesis round-trip", saved.get("ownershipTargetPct") == 12.5 and
          saved.get("risk") == "Aggressive", str(saved)[:200])
    r = client.post("/theses/{}/activate".format(active["id"]))
    check("1m setActiveThesis", r.status_code == 200)

    sr = client.post("/search", json={"query": "AI infra seed deals in the US with contradictions"}).json()
    check("1n search criteria object", "criteria" in sr and "raw" in sr["criteria"], str(sr.get("criteria")))
    check("1o search full deal objects + match/why",
          sr["deals"] and keys_ok(sr["deals"][0], ("deal", "match", "why")) and
          isinstance(sr["deals"][0]["why"], list) and "company" in sr["deals"][0]["deal"],
          str(sr["deals"][:1])[:200])

    st = client.get("/deals/voyager/outreach/state").json()
    check("1p outreach state enum", st.get("status") in ("not_sent", "sent"), str(st))
    dr = client.get("/deals/voyager/outreach/draft").json()
    check("1q outreach draft shape",
          keys_ok(dr, ("subject", "body", "signals", "signalStrength")) and
          (not dr["signals"] or keys_ok(dr["signals"][0], ("label", "detail"))),
          str(dr)[:200])
    sent = client.post("/deals/voyager/outreach/send", json={"channel": "Email"}).json()
    check("1r outreach send simulated", sent.get("status") == "sent" and sent.get("simulated") is True,
          str(sent))

    arts = client.get("/deals/metricflow/artifacts").json()
    check("1s artifacts list", isinstance(arts, list) and
          (not arts or keys_ok(arts[0], ("id", "label", "kind", "note"))), str(arts)[:200])

    ing = client.post("/ingest/hn", params={"limit": 0}).json()
    check("1t ingest returns entity lists", all(k in ing for k in ("signals", "founders", "deals")),
          str(list(ing)))


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


# ---- 2 + 7. decide flow, status filter, feedback loop ----

def t2_decide_and_feedback():
    active = client.get("/theses/active").json()
    note = "Declining despite a positive read: we already have runtime exposure via Helix; avoid portfolio overlap in AI infra runtimes."
    r = client.post("/deals/canvasql/decide",
                    json={"decision": "decline", "note": note})
    rec = r.json() if r.status_code == 200 else {}
    check("2a decide returns DecisionRecord",
          r.status_code == 200 and keys_ok(rec, ("id", "dealId", "kind", "note",
                                                 "timestamp", "analysisLabel", "actor")),
          r.text[:200])
    check("2b analysisLabel simulated", "Simulated" in rec.get("analysisLabel", ""), str(rec))
    r = client.post("/deals/canvasql/decide", json={"decision": "decline"})
    check("2c decide without note → 422", r.status_code == 422)

    decs = client.get("/deals/canvasql/decisions").json()
    check("2d listDecisions", decs and decs[0]["kind"] == "decline", str(decs[:1]))

    pending = [d["id"] for d in client.get("/deals").json()]
    decided = [d["id"] for d in client.get("/deals", params={"status": "decided"}).json()]
    check("2e default excludes decided", "canvasql" not in pending, str(pending))
    check("2f ?status=decided returns them", "canvasql" in decided, str(decided))

    fb = client.get("/theses/{}/feedback".format(active["id"])).json()
    check("7a feedback stored for thesis",
          any("portfolio overlap" in (n.get("note") or "") for n in fb), str(fb[:2]))


# ---- 3 + 4. contradiction quality ----

def t3_clean_deal():
    d = client.get("/deals/driftwatch").json()
    bad = [c for c in d["claims"] if c["status"] == "contradicted"]
    check("3 driftwatch ZERO contradicted + alerts=0",
          not bad and d["alerts"] == 0,
          "contradicted={} alerts={}".format([c["claim"][:60] for c in bad], d["alerts"]))


def t4_contradictions_caught():
    for did in ("metricflow", "securestack"):
        d = client.get("/deals/{}".format(did)).json()
        bad = [c for c in d["claims"] if c["status"] == "contradicted"]
        ok = False
        detail = "no contradicted claims"
        for c in bad:
            quote = c.get("conflictingEvidence") or ""
            arts = client.get("/deals/{}/artifacts".format(did)).json()
            blob = " ".join(a["note"] for a in arts)
            con = sqlite3.connect(os.path.join(ROOT, "vcbrain.db"))
            texts = [r[0] for r in con.execute(
                "select json_extract(raw_json,'$.text') from signals where deal_id=? "
                "and json_extract(raw_json,'$.text') is not null", (did,)).fetchall()]
            full_blob = " ".join(texts) + " " + blob
            if quote and quote_in_text(quote, full_blob):
                ok = True
                break
            detail = "quote not found in artifacts: {}".format(quote[:120])
        check("4 {} contradiction caught w/ real quote".format(did), ok and d["alerts"] > 0, detail)


# ---- 5. DB-wide sourceQuote checker ----

def t5_source_quotes():
    con = sqlite3.connect(os.path.join(ROOT, "vcbrain.db"))
    con.row_factory = sqlite3.Row
    violations = []
    total = 0
    for c in con.execute("select id, deal_id, claim, source_quote from claims").fetchall():
        total += 1
        texts = [r[0] for r in con.execute(
            "select coalesce(json_extract(raw_json,'$.full_text'), json_extract(raw_json,'$.text')) "
            "from signals where deal_id=? and (json_extract(raw_json,'$.text') is not null "
            "or json_extract(raw_json,'$.full_text') is not null)", (c["deal_id"],)).fetchall()]
        payloads = [r[0] for r in con.execute(
            "select json_extract(raw_json,'$.payload') from signals where deal_id=? "
            "and json_extract(raw_json,'$.payload') is not null", (c["deal_id"],)).fetchall()]
        blob = " ".join(texts) + " " + " ".join(payloads)
        if not c["source_quote"] or not quote_in_text(c["source_quote"], blob):
            violations.append("{}: {}".format(c["id"], (c["source_quote"] or "<none>")[:80]))
    check("5 every claim quote-anchored ({} claims)".format(total), not violations,
          "; ".join(violations[:5]))


# ---- 6. real PDF application ----

def _minimal_pdf(lines):
    text_ops = "BT /F1 12 Tf 72 720 Td " + " 0 -20 Td ".join(
        "({}) Tj".format(l.replace("(", "[").replace(")", "]")) for l in lines) + " ET"
    stream = text_ops.encode()
    objs = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
    ]
    out = b"%PDF-1.4\n"
    offsets = []
    for i, body in enumerate(objs, start=1):
        offsets.append(len(out))
        out += "{} 0 obj\n".format(i).encode() + body + b"\nendobj\n"
    xref_pos = len(out)
    out += b"xref\n0 6\n0000000000 65535 f \n"
    for off in offsets:
        out += "{:010d} 00000 n \n".format(off).encode()
    out += (b"trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n"
            + str(xref_pos).encode() + b"\n%%EOF\n")
    return out


def t6_pdf_application():
    pdf = _minimal_pdf([
        "LumaFlow builds battery analytics software for commercial EV fleets.",
        "We have 12 paying fleet customers today.",
        "Annual recurring revenue is 200,000 dollars as of this quarter.",
        "The founding team previously built telematics systems at Geotab.",
    ])
    r = client.post("/applications", json={
        "company": "LumaFlow",
        "tagline": "Battery analytics for commercial EV fleets.",
        "sector": "B2B SaaS", "stage": "Seed", "geography": "US",
        "founders": [{"name": "Vera Lund", "role": "CEO", "email": "vera@lumaflow.io"}],
        "links": [], "hasDeck": True, "askUsd": 150000,
        "deckFile": base64.b64encode(pdf).decode()})
    body = r.json() if r.status_code == 200 else {}
    deal = body.get("deal") or {}
    check("6a PDF application 200 + viable", r.status_code == 200 and body.get("viable"),
          r.text[:300])
    check("6b askUsd stored", deal.get("askUsd") == 150000, str(deal.get("askUsd")))
    con = sqlite3.connect(os.path.join(ROOT, "vcbrain.db"))
    quotes = [r2[0] for r2 in con.execute(
        "select source_quote from claims where deal_id=?", (body.get("dealId"),)).fetchall()]
    check("6c PDF text extracted → quote-anchored claims",
          quotes and any("12 paying" in (q or "") or "200,000" in (q or "") or
                         "Geotab" in (q or "") for q in quotes), str(quotes[:4]))
    return body.get("dealId")


# ---- 7b/8. trace ----

def t8_trace(fresh_deal_id):
    tr = client.get("/deals/helix/trace").json()
    steps = [t["step"] for t in tr]
    check("8a reprocessed deal trace ordered",
          steps and steps.index("extraction") < steps.index("memo"), str(steps))
    if fresh_deal_id:
        tr2 = client.get("/deals/{}/trace".format(fresh_deal_id)).json()
        fb = [t for t in tr2 if t["step"] == "feedback-context"]
        check("7b feedback context injected into next scoring run",
              fb and "1 feedback note" in fb[0]["summary"] or (fb and "note(s) injected" in fb[0]["summary"] and not fb[0]["summary"].startswith("0")),
              str(fb))


# ---- 9. metrics ----

def t9_metrics():
    m = client.get("/metrics/summary").json()
    keys = ("pendingCount", "decidedCount", "medianSignalToDecisionHours",
            "contradictionsCaught", "coldStartCount", "realSourcedCount")
    check("9a metrics keys", keys_ok(m, keys), str(m))
    check("9b metrics sane", m.get("pendingCount", 0) > 0 and m.get("decidedCount", 0) >= 1
          and m.get("contradictionsCaught", 0) >= 2 and m.get("coldStartCount", 0) >= 1
          and m.get("realSourcedCount", 0) >= 1, str(m))


def main():
    t1_contract_surface()
    t2_decide_and_feedback()
    t3_clean_deal()
    t4_contradictions_caught()
    t5_source_quotes()
    fresh = t6_pdf_application()
    t8_trace(fresh)
    t9_metrics()
    failed = [x for x in RESULTS if not x[1]]
    print("\n=== {} passed, {} failed ===".format(len(RESULTS) - len(failed), len(failed)))
    for name, _, detail in failed:
        print("FAILED: {} {}".format(name, detail))
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
