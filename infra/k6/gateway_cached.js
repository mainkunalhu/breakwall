// BreakWall cached-path soak: proves repeat queries stay fast under load.
// Run: k6 run --summary-export reports/k6-cached.json infra/k6/gateway_cached.js
// Requires: gateway :8787 (+ guardrails :8000 and GROQ for the one priming call).
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.GATEWAY_URL || "http://localhost:8787";
const MODEL = __ENV.EVAL_MODEL || "openai/gpt-oss-120b";
const PROMPT = "Say the word mango and nothing else.";

export const options = {
  summaryTrendStats: ["avg", "min", "med", "max", "p(90)", "p(95)", "p(99)", "p(99.9)", "count"],  // Sized for a dev laptop (colima 4cpu/6GB). Scale VUs up on bigger iron;
  // the p99<300ms threshold is the gate either way.
  stages: [
    { duration: "30s", target: 20 },
    { duration: "30s", target: 50 },
    { duration: "60s", target: 100 },
    { duration: "15s", target: 0 },
  ],
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(99)<300"],
  },
};

export function setup() {
  // Prime the semantic cache once (single upstream call).
  const res = http.post(
    `${BASE}/v1/chat`,
    JSON.stringify({ model: MODEL, messages: [{ role: "user", content: PROMPT }] }),
    { headers: { "Content-Type": "application/json" } },
  );
  if (res.status !== 200) throw new Error(`prime failed: ${res.status} ${res.body}`);
}

export default function () {
  const res = http.post(
    `${BASE}/v1/chat`,
    JSON.stringify({ model: MODEL, messages: [{ role: "user", content: PROMPT }] }),
    { headers: { "Content-Type": "application/json" } },
  );
  check(res, {
    "200": (r) => r.status === 200,
    cache_hit: (r) => r.json().decision === "cache_hit",
    "fast (<300ms)": (r) => r.timings.duration < 300,
  });
  sleep(0.2);
}
