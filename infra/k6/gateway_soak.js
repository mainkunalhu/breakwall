import { check } from "k6"
import http from "k6/http"
export const options = {
  vus: 50,
  duration: "30s",
  thresholds: { http_req_failed: ["rate<0.01"] },
}
export default function () {
  const res = http.get("http://localhost:8787/health")
  check(res, { 200: (r) => r.status === 200 })
}
// P6: expand to 5k-conn soak + p99<300ms gate on cached path.
