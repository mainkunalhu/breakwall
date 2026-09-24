import { expect, test } from "bun:test"
import app from "../src/index.js"

test("health ok", async () => {
  const res = await app.fetch(new Request("http://localhost/health"))
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.ok).toBe(true)
})
