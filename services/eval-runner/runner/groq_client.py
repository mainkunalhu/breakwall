"""Async Groq OpenAI-compat client with retries (P4)."""

import asyncio
from dataclasses import dataclass

import httpx

from . import config


@dataclass
class ModelReply:
    output: str
    total_tokens: int
    latency_ms: float


async def _post(
    client: httpx.AsyncClient, payload: dict, timeout_s: float
) -> httpx.Response:
    last: Exception | None = None
    for attempt in range(3):
        try:
            resp = await client.post(
                f"{config.GROQ_BASE}/openai/v1/chat/completions",
                json=payload,
                timeout=timeout_s,
            )
            if resp.status_code in (429, 500, 502, 503) and attempt < 2:
                await asyncio.sleep(2**attempt)
                continue
            return resp
        except (httpx.TimeoutException, httpx.TransportError) as e:
            last = e
            await asyncio.sleep(2**attempt)
    raise last or RuntimeError("groq request failed")


async def complete(
    client: httpx.AsyncClient,
    model: str,
    prompt: str,
    max_tokens: int | None = None,
    temperature: float = 0.0,
) -> ModelReply:
    import time

    started = time.perf_counter()
    resp = await _post(
        client,
        {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": temperature,
            "max_tokens": max_tokens or config.EVAL_MAX_TOKENS,
        },
        config.EVAL_TIMEOUT_S,
    )
    latency_ms = (time.perf_counter() - started) * 1000
    resp.raise_for_status()
    data = resp.json()
    usage = data.get("usage") or {}
    choices = data.get("choices") or [{}]
    msg = (choices[0].get("message") or {}).get("content") or ""
    return ModelReply(
        output=msg,
        total_tokens=int(usage.get("total_tokens") or 0),
        latency_ms=latency_ms,
    )


def build_client(api_key: str | None = None) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        headers={"authorization": f"Bearer {api_key or config.GROQ_API_KEY}"},
        timeout=config.EVAL_TIMEOUT_S,
    )


def estimate_cost(model: str, total_tokens: int) -> float:
    per_1m = config.PRICE_PER_1M.get(model, config.DEFAULT_PRICE_PER_1M)
    return (total_tokens / 1_000_000) * per_1m
