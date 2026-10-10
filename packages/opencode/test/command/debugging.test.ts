import { describe, expect, test } from "bun:test"
import PROMPT_DEBUG_HINT from "../../src/command/template/debug-hint.txt"
import PROMPT_DEBUG_SOLUTION from "../../src/command/template/debug-solution.txt"
import { Default, hints } from "../../src/command"

describe("debugging commands", () => {
  test("hint requests progress through three pedagogical levels", () => {
    expect(Default.DEBUG_HINT).toBe("debug-hint")
    expect(PROMPT_DEBUG_HINT).toContain("Review the conversation before answering")
    expect(PROMPT_DEBUG_HINT).toContain("first level not already given")
    expect(PROMPT_DEBUG_HINT).toContain("1. Conceptual hint")
    expect(PROMPT_DEBUG_HINT).toContain("2. Targeted hint")
    expect(PROMPT_DEBUG_HINT).toContain("3. Specific hint")
    expect(PROMPT_DEBUG_HINT).toContain("must add useful information instead of restating")
  })

  test("progressive hints preserve the solution boundary", () => {
    expect(PROMPT_DEBUG_HINT).toContain("Do not provide corrected code")
    expect(PROMPT_DEBUG_HINT).toContain("Do not make edits")
    expect(PROMPT_DEBUG_HINT).toContain("do not count that question as a hint level")
    expect(PROMPT_DEBUG_HINT).toContain("If three hints have already been given")
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
