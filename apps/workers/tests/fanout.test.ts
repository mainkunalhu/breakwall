import { describe, expect, test } from "bun:test"
import { fanOut } from "../src/index.ts"

describe("workers", () => {
  test("fanOut passes items through", () => {
    expect(fanOut([1, 2, 3])).toEqual([1, 2, 3])
    expect(fanOut([])).toEqual([])
  })
})
