"""OpenAI Structured Outputs plumbing.

Every LLM call in the app goes through parse_llm/safe_parse: 2 retries with
exponential backoff, and callers use safe_parse so an LLM failure degrades
into an `errors` entry instead of a 500. Strict-mode schemas: every field is
required; Optional fields carry no default so they stay required-but-nullable.
"""
import asyncio
from typing import List, Literal, Optional, Tuple, Type, TypeVar

from openai import AsyncOpenAI
from pydantic import BaseModel

from app.config import OPENAI_API_KEY, TEMPERATURE

client = AsyncOpenAI(api_key=OPENAI_API_KEY)

T = TypeVar("T", bound=BaseModel)


class LLMError(Exception):
    pass


async def parse_llm(model: str, system: str, user: str, response_model: Type[T],
                    temperature: float = TEMPERATURE) -> T:
    last: Optional[Exception] = None
    for attempt in range(3):  # initial try + 2 retries
        try:
            resp = await client.beta.chat.completions.parse(
                model=model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                response_format=response_model,
                temperature=temperature,
            )
            parsed = resp.choices[0].message.parsed
            if parsed is None:
                raise LLMError("model returned no parsed output (refusal)")
            return parsed
        except Exception as exc:  # noqa: BLE001 — degrade, never crash the endpoint
            last = exc
            if attempt < 2:
                await asyncio.sleep(0.5 * (2 ** attempt))
    raise LLMError(str(last))


async def safe_parse(label: str, model: str, system: str, user: str, response_model: Type[T],
                     temperature: float = TEMPERATURE) -> Tuple[Optional[T], Optional[str]]:
    """Returns (parsed, None) or (None, "label: error")."""
    try:
        return await parse_llm(model, system, user, response_model, temperature), None
    except Exception as exc:  # noqa: BLE001
        return None, "{}: {}".format(label, exc)


# ---- structured-output response models (internal, snake_case) ----

class FilterResult(BaseModel):
    is_viable: bool
    reason: str


class ExtractedClaim(BaseModel):
    claim: str
    source: str


class ExtractedClaims(BaseModel):
    claims: List[ExtractedClaim]


class FootprintAssessment(BaseModel):
    score: int  # 0-30
    uncertainty_note: str
    highlights: List[str]


class CoverageItemLLM(BaseModel):
    area: Literal["Product", "Engineering", "AI / domain", "Enterprise sales",
                  "Marketing", "Finance", "Operations"]
    rating: Literal["Strong", "Moderate", "Weak", "Missing", "Unknown"]
    note: Optional[str]


class FounderAxisLLM(BaseModel):
    score: int  # 1-100
    summary: str
    note: str
    team_coverage: List[CoverageItemLLM]


class MarketAxisLLM(BaseModel):
    rating: Literal["Bullish", "Neutral", "Bear"]
    tam: str
    summary: str
    competitors: List[str]


class IdeaVsMarketLLM(BaseModel):
    score: int  # 1-100
    verdict: str
    flexibility: str


class ContradictionCheckLLM(BaseModel):
    contradicted: bool
    explanation: str
    conflicting_evidence: Optional[str]


class TrustClassificationLLM(BaseModel):
    status: Literal["verified", "unverified", "contradicted"]
    confidence: float  # 0-1
    detail: str
    explanation: str
    source_url: Optional[str]


class TractionLLM(BaseModel):
    label: str
    value: str


class MemoLLM(BaseModel):
    snapshot: str
    hypotheses: List[str]
    strengths: List[str]
    weaknesses: List[str]
    opportunities: List[str]
    risks: List[str]
    problem_product: str
    traction: List[TractionLLM]


class OutreachLLM(BaseModel):
    draft: str


class SearchCriteriaLLM(BaseModel):
    criteria: List[str]
    sectors: List[str]
    geographies: List[str]
    stages: List[str]
    keywords: List[str]
    cold_start_only: Optional[bool]
    min_founder_score: Optional[int]


class ChapterTextLLM(BaseModel):
    title: str
    text: str


class BriefingLLM(BaseModel):
    chapters: List[ChapterTextLLM]
