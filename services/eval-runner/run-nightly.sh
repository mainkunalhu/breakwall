#!/bin/bash
# BreakWall nightly eval. Add to cron: 0 3 * * * cd /path/to/breakwall && ./services/eval-runner/run-nightly.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
set -a; source .env; set +a
STAMP="$(date +%F)"
mkdir -p reports
(cd services/eval-runner && uv run python -m runner \
  --model "${GROQ_PRIMARY_MODEL:-openai/gpt-oss-120b}" \
  --export-md "$ROOT/reports/eval-$STAMP.md" \
  --fail-on-gate)
