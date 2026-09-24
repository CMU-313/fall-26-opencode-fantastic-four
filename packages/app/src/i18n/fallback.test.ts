import { describe, expect, test } from "bun:test"
import { mergeWithEnglishFallback } from "./fallback"

describe("English translation fallback", () => {
  test("uses English for missing translations and localized values when present", () => {
    const result = mergeWithEnglishFallback(
      { translated: "English", missing: "English fallback" },
      { translated: "Localized" },
    )

    expect(result).toEqual({ translated: "Localized", missing: "English fallback" })
  })
})
