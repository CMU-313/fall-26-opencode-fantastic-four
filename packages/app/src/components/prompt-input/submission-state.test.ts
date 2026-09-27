import { describe, expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { createPromptState } from "@/context/prompt-state"
import { createPromptSubmissionState } from "./submission-state"

describe("prompt submission state", () => {
  test("moves the selected explanation level into a newly created session", () => {
    createRoot((dispose) => {
      const workspace = createPromptState()
      const session = createPromptState()
      workspace.explanationLevel.set("advanced")

      const submission = createPromptSubmissionState({
        target: workspace,
        prompt: workspace.current(),
        context: [],
      })
      submission.retarget(session)

      expect(session.explanationLevel.current()).toBe("advanced")
      expect(workspace.explanationLevel.current()).toBe("beginner")
      dispose()
    })
  })
})
