# Guardrails (P2) — layered verdict, low false positives

Service: `services/guardrails` (FastAPI). Endpoints: `POST /v1/guard`, `GET /metrics`, `GET /health`.

## Pipeline

```
prompt -> PII scan -> heuristic rules -> [prompt-guard-2] -> [LLM judge] -> allow | redact | block
```

1. **PII scan** (`app/pii.py`): strict regexes — email, phone (requires `+`/separators,
   bare integers never flag), SSN, credit card (Luhn-checked), secrets (`gsk_`, `sk-`,
   `ghp_`, `AKIA…`, `api_key: …`). Findings produce `redact` + `redactedPrompt`.
2. **Heuristic rules** (`app/rules.py`): weighted signals (`instruction_override` 0.9,
   `system_prompt_exfil` 0.85, `role_hijack` 0.85, `tool_misuse` 0.85, `safety_suppression`
   0.8, `encoding_evasion` 0.7). Generic roleplay (`pretend you are a pirate`) is a
   separate 0.5 signal — never auto-blocks. Score = max weight + 0.1 per extra signal.
3. **Classifier** (`app/prompt_guard.py`): `meta-llama/llama-prompt-guard-2-86m` via Groq.
   NOTE: Groq serves it as a text-classification model — single user message only
   (system messages → 400), returns a raw `0..1` score string. Combined by max
   with heuristics (a blend would neuter a lone 0.99 classifier vote).
   Returns `None` without key/offline → heuristics-only fallback.
4. **LLM judge** (`app/judge.py`): `openai/gpt-oss-120b`, review band only, has veto
   toward allow/redact (confidence ≥ 0.6) to suppress false positives.

## Decision bands (`GUARD_BLOCK_THRESHOLD=0.85`, `GUARD_REVIEW_THRESHOLD=0.45`)

| Band | Path | Cost |
|---|---|---|
| `score ≥ 0.85` | block immediately (classifier blended if available) | 0–1 guard call |
| `0.45 ≤ score < 0.85` | classifier + judge; judge can veto to allow/redact | ≤2 calls |
| `score < 0.45` | allow, or redact if PII found | 0 calls |

Live verification (P2): injection → `block 0.97`; pirate roleplay → `allow`
(`judge-allow`); email → `redact` with placeholder. Benign suite (8 prompts incl.
"Ignore the rain…", "My system for organizing…") scores 0.0 — no FP.

## Tuning

Raise `GUARD_BLOCK_THRESHOLD` if benign blocks appear; lower `GUARD_REVIEW_THRESHOLD`
to send more to the judge (costs latency). PII patterns are intentionally strict —
extend in `app/pii.py` with tests in `tests/test_pii.py`.
