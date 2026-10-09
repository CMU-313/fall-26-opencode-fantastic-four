import { expect, test } from "bun:test"
import { sendFollowupDraft } from "./submit"

type SendInput = Parameters<typeof sendFollowupDraft>[0]

test("cleans up a failed explanation request without losing its retryable draft", async () => {
  const failure = new Error("provider unavailable")
  const statuses: string[] = []
  const optimistic: string[] = []
  const requests: unknown[] = []
  const draft: SendInput["draft"] = {
    sessionID: "ses_explanation",
    sessionDirectory: "/repo",
    prompt: [
      {
        type: "text",
        content: "Explain the selected code at the Intermediate level.",
        start: 0,
        end: 53,
      },
    ],
    context: [
      {
        key: "file:src/example.ts:2:4",
        type: "file",
        path: "src/example.ts",
        selection: { startLine: 2, startChar: 0, endLine: 4, endChar: 0 },
      },
    ],
    agent: "build",
    model: { providerID: "test", modelID: "test" },
    explanationLevel: "intermediate",
  }
  const api = {
    prompt: async (input: unknown) => {
      requests.push(input)
      throw failure
    },
  } as unknown as SendInput["api"]
  const serverSync = {
    session: {
      set: (_key: string, _sessionID: string, status: { type: string }) => statuses.push(status.type),
    },
  } as unknown as SendInput["serverSync"]
  const sync = {
    data: { command: [] },
    session: {
      optimistic: {
        add: () => optimistic.push("add"),
        remove: () => optimistic.push("remove"),
      },
    },
  } as unknown as SendInput["sync"]

  await expect(
    sendFollowupDraft({ api, serverSync, sync, draft, optimisticBusy: true }),
  ).rejects.toBe(failure)

  expect(statuses).toEqual(["busy", "idle"])
  expect(optimistic).toEqual(["add", "remove"])
  expect(requests).toHaveLength(1)
  expect(draft.context).toEqual([
    {
      key: "file:src/example.ts:2:4",
      type: "file",
      path: "src/example.ts",
      selection: { startLine: 2, startChar: 0, endLine: 4, endChar: 0 },
    },
  ])
})
