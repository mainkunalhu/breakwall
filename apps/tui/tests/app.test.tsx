import { expect, test } from "bun:test"
import { testRender } from "@opentui/react/test-utils"

function App() {
  return <text>BreakWall ready</text>
}

test("renders BreakWall scaffold", async () => {
  const setup = await testRender(<App />, { width: 40, height: 4 })
  try {
    await setup.renderOnce()
    expect(setup.captureCharFrame()).toContain("BreakWall")
  } finally {
    setup.renderer.destroy()
  }
})
