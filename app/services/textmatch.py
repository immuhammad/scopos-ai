"""Fuzzy quote verification — the code-level guard behind quote-anchored claims.
A quote counts as present when, after whitespace/case normalization, it is a
substring of the source or a sliding-window similarity beats the threshold."""
import re
from difflib import SequenceMatcher


def normalize(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").lower().replace("’", "'").replace("‘", "'")
                  .replace("“", '"').replace("”", '"').replace("—", "-").replace("–", "-")).strip()


def quote_in_text(quote: str, text: str, threshold: float = 0.85) -> bool:
    q, t = normalize(quote), normalize(text)
    if not q or not t:
        return False
    if q in t:
        return True
    n, m = len(q), len(t)
    if n > m:
        return SequenceMatcher(None, q, t).ratio() >= threshold
    step = max(1, n // 4)
    window = n + min(40, n // 2)
    best = 0.0
    for i in range(0, m - n + 1, step):
        r = SequenceMatcher(None, q, t[i:i + window]).ratio()
        if r > best:
            best = r
        if best >= threshold:
            return True
    return best >= threshold
