import { expect, test } from "bun:test"
import { Effect, Schema } from "effect"
import { OpenAIChat } from "@opencode-ai/llm/protocols/openai-chat"
import { Auth } from "@opencode-ai/llm/route"
import { SessionWalkthrough } from "@opencode-ai/core/session/walkthrough"
import { RelativePath } from "@opencode-ai/core/schema"
import { dynamicResponse, fixedResponse } from "../../llm/test/lib/http"
import { finishChunk, toolCallChunk } from "../../llm/test/lib/openai-chunks"
import { sseEvents } from "../../llm/test/lib/sse"

const model = OpenAIChat.route
  .with({ endpoint: { baseURL: "https://api.openai.test/v1/" }, auth: Auth.bearer("test") })
  .model({ id: "gpt-4o-mini" })

const diff = {
  path: RelativePath.make("src/greet.ts"),
  status: "modified" as const,
  additions: 1,
  deletions: 1,
  patch: '-return "Hello " + name\n+return `Hello ${name.trim()}`',
}

const explanation = {
  whatChanged: "Trims whitespace from the name before greeting the user.",
  whyChanged: "The user requested consistent greetings for names with surrounding spaces.",
  concepts: ["String normalization", "Template literals"],
}

test("walkthrough entries contain the file, explanation, reason, and concepts", () => {
  const decode = Schema.decodeUnknownSync(SessionWalkthrough.Entry)
  expect(decode({ file: diff.path, ...explanation })).toEqual({ file: diff.path, ...explanation })
  expect(decode({ file: diff.path, ...explanation, concepts: [] }).concepts).toEqual([])
  expect(() => decode({ file: diff.path, ...explanation, whyChanged: "  " })).toThrow()
  expect(() => decode({ file: diff.path, ...explanation, whatChanged: "" })).toThrow()
  expect(() => decode({ file: diff.path, ...explanation, concepts: [""] })).toThrow()
})

test("prompt reuses the existing diff and includes context for the reason", () => {
  expect(JSON.parse(SessionWalkthrough.buildPrompt({ diff, context: "Trim names before greeting." }))).toEqual({
    context: "Trim names before greeting.",
    file: diff.path,
    status: diff.status,
    additions: diff.additions,
    deletions: diff.deletions,
    patch: diff.patch,
  })
})

test("large patches and context are bounded and explicitly marked as truncated", () => {
  const prompt = SessionWalkthrough.buildPrompt({
    diff: { ...diff, patch: "x".repeat(20_000) },
    context: "y".repeat(10_000),
  })
  expect(prompt.length).toBeLessThan(25_000)
  expect(JSON.parse(prompt).patch).toEndWith("[truncated]")
  expect(JSON.parse(prompt).context).toEndWith("[truncated]")
})

test("generates an entry for every changed file using the real structured-output decoder", async () => {
  const requests: string[] = []
  const diffs = [diff, { ...diff, path: RelativePath.make("src/new.ts"), status: "added" as const }]
  const entries = await Effect.runPromise(
    SessionWalkthrough.generate({ diffs, context: "Trim names before greeting.", model }).pipe(
      Effect.provide(
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
      ),
    ),
  )
  expect(entries).toEqual(diffs.map((item) => ({ file: item.path, ...explanation })))
  expect(requests).toHaveLength(2)
  expect(requests[0]).toContain("Trim names before greeting.")
  expect(requests[0]).toContain("name.trim()")
})

test("empty diffs return an empty walkthrough without contacting a provider", async () => {
  expect(await Effect.runPromise(SessionWalkthrough.generate({ diffs: [], context: "", model }))).toEqual([])
})

test("missing reasons fail validation instead of returning an incomplete walkthrough", async () => {
  const result = await Effect.runPromise(
    SessionWalkthrough.generate({ diffs: [diff], context: "", model }).pipe(
      Effect.provide(
        fixedResponse(
          sseEvents(
            toolCallChunk(
              "call_1",
              "generate_object",
              JSON.stringify({ whatChanged: "Updated greeting", concepts: [] }),
            ),
            finishChunk("tool_calls"),
          ),
        ),
      ),
      Effect.flip,
    ),
  )
  expect(result._tag).toBe("LLM.Error")
})

test("provider errors propagate without fabricated explanations", async () => {
  const result = await Effect.runPromise(
    SessionWalkthrough.generate({ diffs: [diff], context: "", model }).pipe(
      Effect.provide(fixedResponse("Unauthorized", { status: 401 })),
      Effect.flip,
    ),
  )
  expect(result._tag).toBe("LLM.Error")
})
