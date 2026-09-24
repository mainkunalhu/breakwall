include .env
export

.PHONY: dev-all dev-down

dev-all:
	@echo "▸ Starting infrastructure (Postgres, Redis, Prometheus, Grafana)..."
	docker-compose -f infra/docker-compose.yml up -d
	@echo "▸ Starting Guardrails + Gateway..."
	bunx concurrently \
		-n guardrails,gateway \
		-c blue,green \
		"cd services/guardrails && uv run uvicorn app.main:app --host 0.0.0.0 --port 8000" \
		"bun --filter gateway dev"

dev-down:
	@echo "▸ Stopping infrastructure..."
	docker-compose -f infra/docker-compose.yml down
	@echo "Done."
