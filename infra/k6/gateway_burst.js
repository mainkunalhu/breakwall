// BreakWall burst probe: finds the concurrency ceiling on current hardware.
// NOT a gate — informational. Run: k6 run infra/k6/gateway_burst.js
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.GATEWAY_URL || "http://localhost:8787";
const MODEL = __ENV.EVAL_MODEL || "openai/gpt-oss-120b";
const PROMPT = "Say the word mango and nothing else.";

export const options = {
  summaryTrendStats: ["avg", "min", "med", "max", "p(90)", "p(95)", "p(99)", "count"],
  stages: [
    { duration: "20s", target: 200 },
    { duration: "60s", target: 300 },
    { duration: "15s", target: 0 },
  ],
  thresholds: {
    http_req_failed: ["rate<0.05"],
  },
};

export function setup() {
  const res = http.post(
    `${BASE}/v1/chat`,
    JSON.stringify({ model: MODEL, messages: [{ role: "user", content: PROMPT }] }),
    { headers: { "Content-Type": "application/json" } },
  );
  if (res.status !== 200) throw new Error(`prime failed: ${res.status}`);
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
  });
  sleep(0.2);
}
