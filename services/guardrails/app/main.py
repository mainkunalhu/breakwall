"""BreakWall guardrails — P0 scaffold. P2 implements regex + prompt-guard-2 + judge."""
from fastapi import FastAPI

app = FastAPI(title="breakwall-guardrails", version="0.0.0")


@app.get("/health")
def health() -> dict:
    return {"ok": True, "service": "guardrails", "phase": "P0"}


@app.post("/v1/guard")
def guard(payload: dict) -> dict:
    return {"decision": "allow", "blockScore": 0.0, "piiFindings": [], "echo": payload}
