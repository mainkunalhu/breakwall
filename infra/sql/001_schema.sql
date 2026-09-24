-- BreakWall P1 schema. Applied via /docker-entrypoint-initdb.d on first boot.
-- Re-apply manually: psql $DATABASE_URL -f infra/sql/001_schema.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Seedable attack cases (mirrors datasets/*.jsonl)
CREATE TABLE IF NOT EXISTS eval_cases (
  id TEXT PRIMARY KEY,
  suite TEXT NOT NULL CHECK (suite IN ('injection','pii_leak','jailbreak','tool_misuse')),
  severity TEXT NOT NULL CHECK (severity IN ('low','medium','high')),
  prompt TEXT NOT NULL,
  expected TEXT NOT NULL CHECK (expected IN ('refuse','redact','safe_complete'))
);
CREATE INDEX IF NOT EXISTS idx_eval_cases_suite ON eval_cases(suite);

-- One row per nightly (or manual) eval run
CREATE TABLE IF NOT EXISTS runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  model TEXT NOT NULL,
  total INT NOT NULL,
  asr DOUBLE PRECISION CHECK (asr IS NULL OR (asr >= 0 AND asr <= 1)),
  leakage DOUBLE PRECISION CHECK (leakage IS NULL OR (leakage >= 0 AND leakage <= 1)),
  faithfulness DOUBLE PRECISION CHECK (faithfulness IS NULL OR (faithfulness >= 0 AND faithfulness <= 1)),
  p95_ms DOUBLE PRECISION CHECK (p95_ms IS NULL OR p95_ms >= 0),
  cost_per_query DOUBLE PRECISION CHECK (cost_per_query IS NULL OR cost_per_query >= 0),
  passed BOOLEAN
);
CREATE INDEX IF NOT EXISTS idx_runs_started ON runs(started_at DESC);

-- Per-case verdicts
CREATE TABLE IF NOT EXISTS verdicts (
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  case_id TEXT NOT NULL REFERENCES eval_cases(id),
  suite TEXT NOT NULL,
  passed BOOLEAN NOT NULL,
  attack_success BOOLEAN NOT NULL,
  leaked BOOLEAN NOT NULL,
  latency_ms DOUBLE PRECISION NOT NULL CHECK (latency_ms >= 0),
  cost_usd DOUBLE PRECISION NOT NULL CHECK (cost_usd >= 0),
  PRIMARY KEY (run_id, case_id)
);
CREATE INDEX IF NOT EXISTS idx_verdicts_run ON verdicts(run_id);
CREATE INDEX IF NOT EXISTS idx_verdicts_suite ON verdicts(suite);

-- Gateway request log (PII-free: sha256 of normalized prompt only)
CREATE TABLE IF NOT EXISTS gateway_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  model TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('allow','redact','block','cache_hit')),
  cached BOOLEAN NOT NULL DEFAULT FALSE,
  latency_ms DOUBLE PRECISION NOT NULL CHECK (latency_ms >= 0),
  prompt_hash CHAR(64) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gateway_logs_ts ON gateway_logs(ts DESC);
CREATE INDEX IF NOT EXISTS idx_gateway_logs_decision ON gateway_logs(decision);
