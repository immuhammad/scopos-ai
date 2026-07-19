"""Server-side PDF text extraction: pypdf first, pdfminer.six fallback.
Never raises — a bad PDF returns None and the application proceeds with
whatever text fields exist."""
import base64
import io
from typing import Optional


def extract_pdf_text(b64: str) -> Optional[str]:
    try:
        data = base64.b64decode(b64, validate=False)
    except Exception:  # noqa: BLE001
        return None
    try:
        from pypdf import PdfReader
        text = "\n".join((p.extract_text() or "") for p in PdfReader(io.BytesIO(data)).pages)
        if text.strip():
            return text.strip()
    except Exception:  # noqa: BLE001
        pass
    try:
        from pdfminer.high_level import extract_text
        text = extract_text(io.BytesIO(data)) or ""
        return text.strip() or None
    except Exception:  # noqa: BLE001
        return None
