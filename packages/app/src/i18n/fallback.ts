export const APP_ENGLISH_FALLBACK_KEYS = [
  "prompt.explanationLevel.label",
  "prompt.explanationLevel.displayLabel",
  "prompt.explanationLevel.beginner",
  "prompt.explanationLevel.intermediate",
  "prompt.explanationLevel.advanced",
  "prompt.explainSelection.requestAtLevel",
  "prompt.explainSelection.moreActions",
  "prompt.explainSelection.regenerate",
  "prompt.explanation.error.tooLarge.title",
  "prompt.explanation.error.tooLarge.description",
  "prompt.explanation.warning.changed.title",
  "prompt.explanation.warning.changed.description",
  "command.context.explainSelection",
  "command.context.explainSelection.description",
] as const

export function mergeWithEnglishFallback<T extends Record<string, string>>(
  english: T,
  localized: Record<string, string>,
) {
  return { ...english, ...localized } as T
}
