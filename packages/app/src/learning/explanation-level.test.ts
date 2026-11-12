import { describe, expect, test } from "bun:test"
import {
  DEFAULT_EXPLANATION_LEVEL,
  EXPLANATION_LEVELS,
  getExplanationInstructions,
  isExplanationLevel,
  parseExplanationLevel,
  type ExplanationLevel,
} from "./explanation-level"

describe("explanation level", () => {
  test("exports the supported levels in UI order", () => {
    expect(EXPLANATION_LEVELS).toEqual(["beginner", "intermediate", "advanced"])
  })

  test("defaults to beginner", () => {
    expect(DEFAULT_EXPLANATION_LEVEL).toBe("beginner")
  })

  test("provides distinct instructions for every level", () => {
    const instructions = EXPLANATION_LEVELS.map(getExplanationInstructions)

    expect(instructions.every((instruction) => instruction.length > 0)).toBe(true)
    expect(new Set(instructions).size).toBe(EXPLANATION_LEVELS.length)
    expect(getExplanationInstructions("beginner")).toContain("Define unfamiliar terms")
    expect(getExplanationInstructions("beginner")).toContain("step by step")
    expect(getExplanationInstructions("intermediate")).toContain("assumes basic programming knowledge")
    expect(getExplanationInstructions("intermediate")).toContain("language or framework")
    expect(getExplanationInstructions("intermediate")).toContain("idioms")
    expect(getExplanationInstructions("advanced")).toContain("design decisions")
    expect(getExplanationInstructions("advanced")).toContain("trade-offs")
    expect(getExplanationInstructions("advanced")).toContain("edge cases")
    expect(getExplanationInstructions("advanced")).toContain("Skip basic definitions")
  })

  test("validates values received at runtime", () => {
    expect(isExplanationLevel("beginner")).toBe(true)
    expect(isExplanationLevel("intermediate")).toBe(true)
    expect(isExplanationLevel("advanced")).toBe(true)
    expect(isExplanationLevel("expert")).toBe(false)
    expect(isExplanationLevel(undefined)).toBe(false)
    expect(parseExplanationLevel("advanced")).toBe("advanced")
    expect(() => parseExplanationLevel("expert")).toThrow("Invalid explanation level")
  })

  test("rejects unsupported values at compile time", () => {
    const accept = (_level: ExplanationLevel) => {}
    accept("beginner")
    // @ts-expect-error Unsupported explanation levels must fail type checking.
    accept("expert")
  })
})
