export const APP_ENGLISH_FALLBACK_KEYS = [
  "prompt.explanationLevel.label",
  "prompt.explanationLevel.beginner",
  "prompt.explanationLevel.intermediate",
  "prompt.explanationLevel.advanced",
] as const

export function mergeWithEnglishFallback<T extends Record<string, string>>(
  english: T,
  localized: Record<string, string>,
) {
  return { ...english, ...localized } as T
}
