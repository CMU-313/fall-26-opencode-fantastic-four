export const APP_ENGLISH_FALLBACK_KEYS = [
  "prompt.explanationLevel.label",
  "prompt.explanationLevel.beginner",
  "prompt.explanationLevel.intermediate",
  "prompt.explanationLevel.advanced",
  "prompt.explainSelection.request",
  "command.context.explainSelection",
  "command.context.explainSelection.description",
] as const

export function mergeWithEnglishFallback<T extends Record<string, string>>(
  english: T,
  localized: Record<string, string>,
) {
  return { ...english, ...localized } as T
}
