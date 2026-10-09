import { describe, expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { createPromptState, DEFAULT_PROMPT } from "./prompt-state"
import { DEFAULT_EXPLANATION_LEVEL } from "@/learning/explanation-level"

describe("prompt state initialization", () => {
  test("initializes prompt text, cursor, and model together", () => {
    createRoot((dispose) => {
      const model = { providerID: "anthropic", modelID: "claude", variant: "high" }
      const prompt = createPromptState({ prompt: "hello", model })

      expect(prompt.current()).toEqual([{ type: "text", content: "hello", start: 0, end: 5 }])
      expect(prompt.cursor()).toBe(5)
      expect(prompt.model.current()).toEqual(model)
      expect(prompt.model.current()).not.toBe(model)
      dispose()
    })
  })

  test("uses the default prompt without initial values", () => {
    createRoot((dispose) => {
      const prompt = createPromptState()

      expect(prompt.current()).toEqual(DEFAULT_PROMPT)
      expect(prompt.cursor()).toBeUndefined()
      expect(prompt.model.current()).toBeUndefined()
      expect(prompt.explanationLevel.current()).toBe(DEFAULT_EXPLANATION_LEVEL)
      expect(prompt.explanationRequest.current()).toBe(false)
      dispose()
    })
  })
})

describe("prompt explanation level", () => {
  test("changes the active level without resetting it after a prompt", () => {
    createRoot((dispose) => {
      const prompt = createPromptState()

      prompt.explanationLevel.set("advanced")
      prompt.set([{ type: "text", content: "hello", start: 0, end: 5 }])
      prompt.reset()

      expect(prompt.explanationLevel.current()).toBe("advanced")
      dispose()
    })
  })

  test("isolates the selected level between prompt sessions", () => {
    createRoot((dispose) => {
      const first = createPromptState()
      const second = createPromptState()

      first.explanationLevel.set("intermediate")

      expect(first.explanationLevel.current()).toBe("intermediate")
      expect(second.explanationLevel.current()).toBe(DEFAULT_EXPLANATION_LEVEL)
      dispose()
    })
  })
})

describe("prompt explanation request", () => {
  test("clears the one-shot explanation request when the prompt resets", () => {
    createRoot((dispose) => {
      const prompt = createPromptState()

      prompt.explanationRequest.start()
      expect(prompt.explanationRequest.current()).toBe(true)

      prompt.reset()
      expect(prompt.explanationRequest.current()).toBe(false)
      dispose()
    })
  })
})
