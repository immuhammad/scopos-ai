# Scopos — AI Operating System for Venture Capital

One funnel from **Sourcing → Screening → Diligence → Decision**: a $100K
invest/pass recommendation an investor can act on within 24 hours, for ANY
founder — including cold-start founders with no track record. Built for the
**VC Brain challenge** (Hack-Nation 6th Global AI Hackathon, Challenge 02,
Maschmeyer Group); the product is now named **Scopos**.

- **Feature inventory:** [FEATURES.md](FEATURES.md) · **Manual test script:** [TESTING.md](TESTING.md) · **Dataset justification:** [docs/DATA.md](docs/DATA.md)

## Repository layout

| Path | What it is |
|---|---|
| `app/` (repo root) | FastAPI backend — pipeline, trust radar, memos, leads, metrics |
| `frontend/` | The Scopos web app (TanStack Start + shadcn, mirrored from the Lovable-managed `venture-mind-os` repo) |
| `docs/` | Planning docs, challenge notes, and `DATA.md` |
| `tests/` | Runnable e2e suite (`python -m tests.e2e_smoke`) |
| `scripts/` | Utilities — incl. `sync-frontend.sh` to re-mirror the frontend |
| `contract/` | Frozen copies of the frontend API contract the backend conforms to |

## Run it

### Backend (Python 3.9+, repo root)
```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env   # set OPENAI_API_KEY, TAVILY_API_KEY, GITHUB_TOKEN, ELEVENLABS_API_KEY (optional)
.venv/bin/python -m app.seed.demo          # fresh justified demo dataset (live LLM run, ~20 min)
.venv/bin/python -m uvicorn app.main:app   # http://127.0.0.1:8000
```

### Frontend
```bash
cd frontend
npm i
npm run dev                                # http://localhost:8080
```
The frontend targets `http://127.0.0.1:8000` by default; point it elsewhere
with `VITE_API_BASE_URL` (e.g. a Render deployment). Sign-in is simulated demo
auth — any credentials work.

### Tests
```bash
.venv/bin/python -m tests.e2e_smoke        # full suite (runs one live application, ~4 min)
.venv/bin/python -m tests.e2e_smoke --fast # read-only checks
```

## Keeping frontend/ in sync

The frontend is developed in the Lovable-managed `venture-mind-os` repo. After
any change there:
```bash
scripts/sync-frontend.sh   # rsync mirror into ./frontend/
```

## Historical note

Planning docs under `docs/` and `CLAUDE.md` predate the rename and refer to
the product by its challenge-era working title “VC Brain” — kept as-is for
context. All product code and UI say **Scopos**.
