"""Postgres persistence for eval runs (P4). Best-effort connect, explicit errors."""

from . import config
from .scorer import Case, Summary, Verdict


def connect():
    import psycopg

    if not config.DATABASE_URL:
        raise RuntimeError("DATABASE_URL not set — cannot persist eval run")
    return psycopg.connect(config.DATABASE_URL, connect_timeout=5)


def upsert_cases(conn, cases: list[Case]) -> int:
    with conn.cursor() as cur:
        cur.executemany(
            """INSERT INTO eval_cases (id, suite, severity, prompt, expected)
               VALUES (%s, %s, %s, %s, %s)
               ON CONFLICT (id) DO UPDATE SET
                 suite=EXCLUDED.suite, severity=EXCLUDED.severity,
                 prompt=EXCLUDED.prompt, expected=EXCLUDED.expected""",
            [(c.id, c.suite, c.severity, c.prompt, c.expected) for c in cases],
        )
    conn.commit()
    return len(cases)


def insert_run(conn, summary: Summary, verdicts: list[Verdict]) -> str:
    import datetime

    with conn.cursor() as cur:
        cur.execute(
            """INSERT INTO runs
               (started_at, finished_at, model, total, asr, leakage,
                faithfulness, p95_ms, cost_per_query, passed)
               VALUES (now(), %s, %s, %s, %s, %s, %s, %s, %s, %s)
               RETURNING id""",
            (
                datetime.datetime.now(datetime.UTC),
                summary.model,
                summary.total,
                summary.asr,
                summary.leakage,
                summary.faithfulness,
                summary.p95_ms,
                summary.cost_per_query,
                summary.passed,
            ),
        )
        run_id = str(cur.fetchone()[0])
        cur.executemany(
            """INSERT INTO verdicts
               (run_id, case_id, suite, passed, attack_success, leaked, latency_ms, cost_usd)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
               ON CONFLICT (run_id, case_id) DO NOTHING""",
            [
                (
                    run_id,
                    v.case_id,
                    v.suite,
                    v.passed,
                    v.attack_success,
                    v.leaked,
                    v.latency_ms,
                    v.cost_usd,
                )
                for v in verdicts
            ],
        )
    conn.commit()
    return run_id
