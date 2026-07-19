"""Outreach = editable DRAFTS only. Nothing is ever auto-sent externally."""
from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy.orm import Session

from app.config import MODEL_MINI
from app.llm import OutreachLLM, safe_parse
from app.models import OutreachDraftRow, ThesisRow


async def draft_outreach(db: Session, founder_id: str, deal_id: str,
                         project_desc: str, thesis: Optional[ThesisRow],
                         errors: List[str]) -> Optional[str]:
    thesis_line = "our thesis '{}' ({} / {})".format(
        thesis.name, ", ".join(thesis.sectors or []), thesis.stage) if thesis else "our current thesis"
    res, err = await safe_parse(
        "outreach", MODEL_MINI,
        "Draft a personalized VC outreach message (4-6 sentences). Reference the "
        "founder's SPECIFIC project concretely, say why it fits the thesis, and "
        "invite them to apply. No generic flattery, no invented facts. This is a "
        "DRAFT a human will edit and send — do not add signatures.",
        "PROJECT: {}\nTHESIS: {}".format(project_desc[:2000], thesis_line),
        OutreachLLM)
    if res is None:
        errors.append(err)
        return None
    db.add(OutreachDraftRow(founder_id=founder_id, deal_id=deal_id,
                            draft_text=res.draft,
                            created_at=datetime.now(timezone.utc).isoformat()))
    return res.draft
