"""Audio briefing: memo → ~150-word chaptered script (mini) → ElevenLabs TTS.
No key or TTS failure → audioUrl null with transcript still returned."""
import os
from typing import Any, Dict, List

import httpx

from app.config import AUDIO_DIR, ELEVENLABS_API_KEY, MODEL_MINI
from app.llm import BriefingLLM, safe_parse
from app.models import DealRow

CHAPTER_TITLES = ["Summary", "Team", "Market", "Product", "Traction",
                  "Evidence Quality", "Risks", "Recommendation"]
WORDS_PER_SEC = 2.6
VOICE_ID = "21m00Tcm4TlvDq8ikWAM"  # ElevenLabs default 'Rachel'


def _fallback_chapters(deal: DealRow, memo: Dict[str, Any]) -> List[Dict[str, str]]:
    swot = memo.get("swot", {})
    return [
        {"title": "Summary", "text": memo.get("snapshot", deal.tagline or deal.company)},
        {"title": "Team", "text": "See founder axis for the team-in-context view."},
        {"title": "Market", "text": "See the market axis rating."},
        {"title": "Product", "text": memo.get("problemProduct", "Not disclosed")},
        {"title": "Traction", "text": "; ".join(
            "{}: {}".format(t.get("label"), t.get("value")) for t in memo.get("traction", [])) or "Not disclosed"},
        {"title": "Evidence Quality", "text": "Verified and contradicted claims are listed in the evidence panel."},
        {"title": "Risks", "text": "; ".join(swot.get("risks", [])) or "Not disclosed"},
        {"title": "Recommendation", "text": "Review the three independent axes before deciding."},
    ]


async def _tts(text: str, out_path: str) -> bool:
    if not ELEVENLABS_API_KEY:
        return False
    try:
        async with httpx.AsyncClient(timeout=60) as http:
            resp = await http.post(
                "https://api.elevenlabs.io/v1/text-to-speech/{}".format(VOICE_ID),
                headers={"xi-api-key": ELEVENLABS_API_KEY},
                json={"text": text, "model_id": "eleven_turbo_v2"},
            )
            if resp.status_code != 200:
                return False
            os.makedirs(os.path.dirname(out_path), exist_ok=True)
            with open(out_path, "wb") as fh:
                fh.write(resp.content)
            return True
    except Exception:  # noqa: BLE001 — TTS is optional, degrade to transcript-only
        return False


async def generate_briefing(deal: DealRow, memo: Dict[str, Any], version: int,
                            errors: List[str]) -> Dict[str, Any]:
    res, err = await safe_parse(
        "briefing", MODEL_MINI,
        "Condense this VC memo into a spoken briefing script of roughly 150 words "
        "total, split across exactly these chapters in order: {}. Each chapter is "
        "1-2 short spoken sentences. Keep 'Not disclosed' gaps explicit; do not "
        "invent facts.".format(", ".join(CHAPTER_TITLES)),
        "DEAL: {}\nMEMO: {}".format(deal.company, str(memo)[:4000]),
        BriefingLLM)
    if res is None:
        errors.append(err)
        chapters_src = _fallback_chapters(deal, memo)
    else:
        chapters_src = [{"title": c.title, "text": c.text} for c in res.chapters]

    transcript_parts: List[str] = []
    chapters: List[Dict[str, Any]] = []
    elapsed_words = 0
    for ch in chapters_src:
        chapters.append({"title": ch["title"], "startSec": round(elapsed_words / WORDS_PER_SEC, 1)})
        transcript_parts.append(ch["text"])
        elapsed_words += len(ch["text"].split())
    transcript = " ".join(transcript_parts)

    filename = "{}-{}.mp3".format(deal.id, version)
    audio_url = None
    if await _tts(transcript, os.path.join(AUDIO_DIR, filename)):
        audio_url = "/audio/{}".format(filename)
    return {"audioUrl": audio_url, "transcript": transcript, "chapters": chapters}
