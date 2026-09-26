import { describe, expect, test } from "bun:test"
import PROMPT_DEBUG_HINT from "../../src/command/template/debug-hint.txt"
import PROMPT_DEBUG_SOLUTION from "../../src/command/template/debug-solution.txt"
import { Default, hints } from "../../src/command"

describe("debugging commands", () => {
  test("initial hint withholds the complete correction", () => {
    expect(Default.DEBUG_HINT).toBe("debug-hint")
    expect(PROMPT_DEBUG_HINT).toContain("Do not provide corrected code")
    expect(PROMPT_DEBUG_HINT).toContain("Do not make edits")
    expect(PROMPT_DEBUG_HINT).toContain("/debug-solution")
    expect(hints(PROMPT_DEBUG_HINT)).toEqual(["$ARGUMENTS"])
  })

  test("explicit solution request exits hint-only assistance", () => {
    expect(Default.DEBUG_SOLUTION).toBe("debug-solution")
    expect(PROMPT_DEBUG_SOLUTION).toContain("explicitly asked to stop hint-based assistance")
    expect(PROMPT_DEBUG_SOLUTION).toContain("provide a complete, actionable correction")
    expect(hints(PROMPT_DEBUG_SOLUTION)).toEqual(["$ARGUMENTS"])
  })
})
