export const EXPLANATION_LEVELS = ["beginner", "intermediate", "advanced"] as const

export type ExplanationLevel = (typeof EXPLANATION_LEVELS)[number]

export const DEFAULT_EXPLANATION_LEVEL: ExplanationLevel = "beginner"

const INSTRUCTIONS = {
  beginner: [
    "Use a guided explanation style.",
    "Define unfamiliar terms, explain relevant syntax, and walk through the code step by step.",
    "Connect each step to its purpose without assuming familiarity with the language or framework.",
  ].join(" "),
  intermediate: [
    "Use a focused explanation style that assumes basic programming knowledge.",
    "Emphasize unfamiliar language or framework syntax, APIs, conventions, and idioms.",
    "Explain how the important pieces work together without repeating universal programming basics.",
  ].join(" "),
  advanced: [
    "Use a concise explanation style that assumes familiarity with the language or framework.",
    "Emphasize design decisions, trade-offs, edge cases, and non-obvious behavior.",
    "Skip basic definitions unless a prerequisite is necessary to understand the selected code.",
  ].join(" "),
} satisfies Record<ExplanationLevel, string>

export function isExplanationLevel(value: unknown): value is ExplanationLevel {
  return EXPLANATION_LEVELS.some((level) => level === value)
}

export function parseExplanationLevel(value: unknown): ExplanationLevel {
  if (isExplanationLevel(value)) return value
  throw new TypeError("Invalid explanation level")
}

export function getExplanationInstructions(level: ExplanationLevel) {
  return INSTRUCTIONS[level]
}
