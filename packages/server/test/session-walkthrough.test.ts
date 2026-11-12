import { expect, test } from "bun:test"
import { Effect, Layer, Schema } from "effect"
import { SessionV2 } from "@opencode-ai/core/session"
import { SessionMessage } from "@opencode-ai/core/session/message"
import { SessionRunnerModel } from "@opencode-ai/core/session/runner/model"
import { Snapshot } from "@opencode-ai/core/snapshot"
import { RelativePath } from "@opencode-ai/core/schema"
import { OpenAIChat } from "../../llm/src/protocols/openai-chat"
import { Auth } from "../../llm/src/route"
import { dynamicResponse } from "../../llm/test/lib/http"
import { finishChunk, toolCallChunk } from "../../llm/test/lib/openai-chunks"
import { sseEvents } from "../../llm/test/lib/sse"
import { requestWalkthrough } from "../src/session-walkthrough"

const session = Schema.decodeUnknownSync(SessionV2.Info)({
  id: "ses_walkthrough",
  projectID: "project",
  title: "Learning",
  location: { directory: "/project" },
  cost: 0,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  time: { created: 1, updated: 2 },
})
const model = OpenAIChat.route
  .with({
    endpoint: { baseURL: "https://api.openai.test/v1/" },
    auth: Auth.bearer("test"),
  })
  .model({ id: "gpt-4o-mini" })
const revert = {
  stage: () => Effect.die("Walkthrough must not stage a revert"),
  clear: () => Effect.die("Walkthrough must not clear a revert"),
  commit: () => Effect.die("Walkthrough must not commit a revert"),
}
const explanation = {
  whatChanged: "Trims names.",
  whyChanged: "The student requested it.",
  concepts: ["Normalization"],
}
const user = (id: string, text: string) =>
  Schema.decodeUnknownSync(SessionMessage.User)({
    id,
    text,
    type: "user",
    time: { created: 1 },
  })
const assistant = (id: string, start: string, end: string, file: string) =>
  Schema.decodeUnknownSync(SessionMessage.Assistant)({
    id,
    type: "assistant",
    agent: "build",
    model: { id: "gpt-4o-mini", providerID: "openai" },
    content: [],
    time: { created: 1, completed: 2 },
    snapshot: { start, end, files: [file] },
  })

for (const reverted of [false, true]) {
  test(`explicit request uses the session's ${reverted ? "unreverted" : "complete"} snapshot history`, async () => {
    const requests: string[] = []
    const ranges: { from: string; to: string }[] = []
    const messages = [
      user("msg_first", "Trim names"),
      assistant("msg_a", "before", "middle", "greet.ts"),
      user("msg_later", "Add a later feature"),
      assistant("msg_b", "middle", "after", "later.ts"),
    ]
    const layers = Layer.mergeAll(
      Layer.mock(SessionV2.Service, {
        revert,
        get: (id) => {
          expect(id).toBe(session.id)
          return Effect.succeed({ ...session, ...(reverted ? { revert: { messageID: messages[2].id } } : {}) })
        },
        messages: (input) => {
          expect(input).toEqual({ sessionID: session.id, order: "asc" })
          return Effect.succeed(messages)
        },
      }),
      SessionRunnerModel.layerWith((selected) => {
        expect(selected.id).toBe(session.id)
        return Effect.succeed(model)
      }),
      Layer.mock(Snapshot.Service, {
        diff: (range) => {
          ranges.push(range)
          return Effect.succeed([
            {
              path: RelativePath.make("greet.ts"),
              status: "modified" as const,
              additions: 1,
              deletions: 1,
              patch: "+name.trim()",
            },
            ...(!reverted
              ? [
                  {
                    path: RelativePath.make("later.ts"),
                    status: "added" as const,
                    additions: 1,
                    deletions: 0,
                    patch: "+later",
                  },
                ]
              : []),
            {
              path: RelativePath.make("unrelated.ts"),
              status: "added" as const,
              additions: 1,
              deletions: 0,
              patch: "+unrelated",
            },
          ])
        },
      }),
      dynamicResponse((input) => {
        requests.push(input.text)
        return Effect.succeed(
          input.respond(
            sseEvents(
              toolCallChunk("call_1", "generate_object", JSON.stringify(explanation)),
              finishChunk("tool_calls"),
            ),
            { headers: { "content-type": "text/event-stream" } },
          ),
        )
      }),
    )
    expect(requests).toEqual([])
    const entries = await Effect.runPromise(requestWalkthrough(session.id).pipe(Effect.provide(layers)))
    expect(ranges).toEqual([{ from: "before", to: reverted ? "middle" : "after" }])
    expect(entries.map((entry) => entry.file)).toEqual(reverted ? ["greet.ts"] : ["greet.ts", "later.ts"])
    expect(requests).toHaveLength(entries.length)
    expect(requests[0]).toContain("Trim names")
    expect(requests.join("\n")).not.toContain("unrelated")
    if (reverted) expect(requests[0]).not.toContain("Add a later feature")
  })
}

test("empty sessions skip model resolution and snapshot access", async () => {
  const result = await Effect.runPromise(
    requestWalkthrough(session.id).pipe(
      Effect.provide(
        Layer.mock(SessionV2.Service, {
          revert,
          get: () => Effect.succeed(session),
          messages: () => Effect.succeed([]),
        }),
      ),
      Effect.provide(Layer.mock(SessionRunnerModel.Service, {})),
      Effect.provide(Layer.mock(Snapshot.Service, {})),
    ),
  )
  expect(result).toEqual([])
})

test("a session reverted to its first prompt has no changes to explain", async () => {
  const first = user("msg_first", "Trim names")
  const result = await Effect.runPromise(
    requestWalkthrough(session.id).pipe(
      Effect.provide(
        Layer.mock(SessionV2.Service, {
          revert,
          get: () => Effect.succeed({ ...session, revert: { messageID: first.id } }),
          messages: () => Effect.succeed([first, assistant("msg_a", "before", "after", "greet.ts")]),
        }),
      ),
      Effect.provide(Layer.mock(SessionRunnerModel.Service, {})),
      Effect.provide(Layer.mock(Snapshot.Service, {})),
    ),
  )
  expect(result).toEqual([])
})

test("missing sessions fail before reading history or resolving a model", async () => {
  const error = new SessionV2.NotFoundError({ sessionID: session.id })
  expect(
    await Effect.runPromise(
      requestWalkthrough(session.id).pipe(
        Effect.provide(Layer.mock(SessionV2.Service, { revert, get: () => Effect.fail(error) })),
        Effect.provide(Layer.mock(SessionRunnerModel.Service, {})),
        Effect.provide(Layer.mock(Snapshot.Service, {})),
        Effect.flip,
      ),
    ),
  ).toEqual(error)
})

test("model resolution failures leave the session and snapshots untouched", async () => {
  const error = new SessionRunnerModel.ModelNotSelectedError({ sessionID: session.id })
  expect(
    await Effect.runPromise(
      requestWalkthrough(session.id).pipe(
        Effect.provide(
          Layer.mock(SessionV2.Service, {
            revert,
            get: () => Effect.succeed(session),
            messages: () =>
              Effect.succeed([user("msg_first", "Trim names"), assistant("msg_a", "before", "after", "greet.ts")]),
          }),
        ),
        Effect.provide(SessionRunnerModel.layerWith(() => Effect.fail(error))),
        Effect.provide(Layer.mock(Snapshot.Service, {})),
        Effect.flip,
      ),
    ),
  ).toEqual(error)
})
