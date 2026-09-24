"""BreakWall nightly eval CLI (P4).

uv run python -m runner --model openai/gpt-oss-120b
uv run python -m runner --suites injection pii_leak --limit 20 --dry-run
"""

import argparse
import asyncio
import sys

from . import config, db, groq_client
from .detectors import planted_secrets
from .groq_client import estimate_cost
from .report import console_table, markdown
from .scorer import Case, Summary, Verdict, load_cases, score_case, summarize


def _dry_reply(case: Case) -> tuple[str, int]:
    if case.expected == "refuse":
        return "I'm sorry, but I can't comply with that request.", 40
    if case.expected == "redact":
        secrets = planted_secrets(case.prompt)
        return f"Here is what you asked: {secrets[0] if secrets else 'data'}", 60
    return "Sure, here is a helpful and safe answer to your question.", 80


async def _run_one(
    sem: asyncio.Semaphore,
    client,
    model: str,
    case: Case,
    dry_run: bool,
) -> tuple[Case, Verdict]:
    async with sem:
        if dry_run:
            output, _tokens = _dry_reply(case)
            latency_ms, cost = 5.0, 0.0
        else:
            reply = await groq_client.complete(client, model, case.prompt)
            output, latency_ms = reply.output, reply.latency_ms
            cost = estimate_cost(model, reply.total_tokens)
        return case, score_case(case, output, latency_ms, cost)


async def run_eval(
    model: str,
    suites: list[str] | None,
    limit: int | None,
    seed: int,
    dry_run: bool,
    persist: bool,
) -> tuple[str | None, Summary, list[Verdict]]:
    cases = load_cases(suites, limit, seed)
    if not cases:
        raise SystemExit("no cases selected")
    sem = asyncio.Semaphore(config.EVAL_CONCURRENCY)
    verdicts: list[Verdict] = []
    if dry_run:
        for case in cases:
            _, v = await _run_one(sem, None, model, case, True)
            verdicts.append(v)
    else:
        if not config.GROQ_API_KEY:
            raise SystemExit("GROQ_API_KEY not set (use --dry-run for offline)")
        async with groq_client.build_client() as client:
            results = await asyncio.gather(
                *[_run_one(sem, client, model, case, False) for case in cases]
            )
            verdicts = [v for _, v in results]
    summary = summarize(model, verdicts)
    run_id: str | None = None
    if persist and not dry_run:
        conn = db.connect()
        try:
            db.upsert_cases(conn, cases)
            run_id = db.insert_run(conn, summary, verdicts)
        finally:
            conn.close()
    return run_id, summary, verdicts


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="BreakWall nightly eval")
    ap.add_argument("--model", default=config.EVAL_MODEL)
    ap.add_argument("--suites", nargs="*", default=None)
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--seed", type=int, default=config.EVAL_SEED)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--no-persist", action="store_true")
    ap.add_argument("--export-md", default=None)
    ap.add_argument("--fail-on-gate", action="store_true")
    args = ap.parse_args(argv)

    run_id, summary, verdicts = asyncio.run(
        run_eval(
            args.model,
            args.suites,
            args.limit,
            args.seed,
            args.dry_run,
            not args.no_persist,
        )
    )
    print(console_table(summary))
    if args.export_md:
        with open(args.export_md, "w") as f:
            f.write(markdown(summary, verdicts, run_id))
        print(f"wrote {args.export_md}")
    if run_id:
        print(f"run_id={run_id}")
    if args.fail_on_gate and not summary.passed:
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
