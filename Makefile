.PHONY: dev-all dev-down

dev-all:
	@echo "Starting infrastructure (Postgres, Redis, Prometheus, Grafana)..."
	docker-compose -f infra/docker-compose.yml up -d
	@echo "Starting services (Guardrails and Gateway)..."
	bunx concurrently \
		-n guardrails,gateway \
		-c blue,green \
		"cd services/guardrails && uv run uvicorn app.main:app --port 8000" \
		"bun --filter gateway dev"

dev-down:
	@echo "Stopping infrastructure..."
	docker-compose -f infra/docker-compose.yml down
	@echo "Done! (Gateway and Guardrails processes terminate when you cancel dev-all)"
