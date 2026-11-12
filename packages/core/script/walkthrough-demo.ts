import { parseArgs } from "node:util"
import { Effect, Layer, Schema } from "effect"
import { Auth, LLMClient, RequestExecutor } from "@opencode-ai/llm/route"
import { OpenAIChat } from "@opencode-ai/llm/protocols/openai-chat"
import { File } from "../src/file"
import { SessionWalkthrough } from "../src/session/walkthrough"

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    live: { type: "boolean", default: false },
    provider: { type: "string", default: "openai" },
    model: { type: "string" },
    "base-url": { type: "string" },
    input: { type: "string" },
    empty: { type: "boolean", default: false },
    help: { type: "boolean", short: "h" },
  },
})

if (values.help) {
  console.log(`Usage: bun run walkthrough:demo [options]

Default: print a walkthrough using a fixed sample provider response (no AI request).
  --live                   Generate a real explanation using an AI provider
  --provider openai|anthropic  Provider protocol (default: openai)
  --model NAME             Required for live mode; use a model available to your account
  --base-url URL           Optional API base URL, including its path (e.g. /v1/)
  --input FILE             JSON containing { context, diffs }; requires --live
  --empty                  Generate from an empty diff list

Live mode reads OPENAI_API_KEY or ANTHROPIC_API_KEY from your environment.
A custom base URL may omit the key for a local provider.
The server password is not an AI provider API key.
JSON results go to stdout; mode/input information goes to stderr.`)
  process.exit(0)
}

const program = Effect.gen(function* () {
  if (values.provider !== "openai" && values.provider !== "anthropic")
    return yield* Effect.fail(new Error("Use --provider openai or --provider anthropic."))
  if (!values.live && (values.input || values.model || values["base-url"]))
    return yield* Effect.fail(
      new Error("Custom input and model settings require --live; sample explanations are fixed."),
    )
  if (values.live && !values.model?.trim()) return yield* Effect.fail(new Error("Live mode requires --model NAME."))

  const input = yield* Effect.promise(() =>
    Bun.file(values.input ?? new URL("./walkthrough-demo.json", import.meta.url)).text(),
  ).pipe(
    Effect.flatMap(
      Schema.decodeUnknownEffect(
        Schema.fromJsonString(
          Schema.Struct({
            context: Schema.String,
            diffs: Schema.Array(File.Diff),
          }),
        ),
      ),
    ),
  )
  const diffs = values.empty ? [] : input.diffs
  console.error(
    values.live
      ? "LIVE MODE: real-provider generation; empty diffs skip the request."
      : "SAMPLE MODE: fixed provider response, not AI-generated.",
  )
  console.error("Input:", JSON.stringify({ context: input.context, diffs }, null, 2))

  if (!values.live) {
    const { fixedResponse } = yield* Effect.promise(() => import("../../llm/test/lib/http"))
    const { toolCallChunk, finishChunk } = yield* Effect.promise(() => import("../../llm/test/lib/openai-chunks"))
    const { sseEvents } = yield* Effect.promise(() => import("../../llm/test/lib/sse"))
    return yield* SessionWalkthrough.generate({
      diffs,
      context: input.context,
      model: OpenAIChat.route.model({ id: "walkthrough-sample" }),
    }).pipe(
      Effect.provide(
        fixedResponse(
          sseEvents(
            toolCallChunk(
              "sample_call",
              "generate_object",
              JSON.stringify({
                whatChanged: "Trims whitespace from the name and substitutes Guest when the trimmed name is empty.",
                whyChanged:
                  "The user requested normalized names and a fallback for blank names so greetings stay meaningful.",
                concepts: ["String normalization with trim()", "Fallback values using logical OR", "Template literals"],
              }),
            ),
            finishChunk("tool_calls"),
          ),
        ),
      ),
    )
  }

  // Use the production HTTP transport in live mode; no sample-response fallback.
  const key = process.env[values.provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY"]
  if (diffs.length > 0 && !key && !values["base-url"])
    return yield* Effect.fail(
      new Error(
        `Set ${values.provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY"} in your terminal before using --live.`,
      ),
    )
  const model = yield* Effect.promise(async () => {
    const endpoint = values["base-url"] ? { baseURL: values["base-url"] } : undefined
    if (values.provider === "anthropic") {
      const { AnthropicMessages } = await import("@opencode-ai/llm/protocols/anthropic-messages")
      return AnthropicMessages.route
        .with({ endpoint, auth: key ? Auth.header("x-api-key", key) : Auth.none })
        .model({ id: values.model! })
    }
    return OpenAIChat.route.with({ endpoint, auth: key ? Auth.bearer(key) : Auth.none }).model({ id: values.model! })
  })
  return yield* SessionWalkthrough.generate({ diffs, context: input.context, model }).pipe(
    Effect.provide(LLMClient.layer.pipe(Layer.provide(RequestExecutor.fetchLayer))),
    Effect.timeout("90 seconds"),
  )
})

await Effect.runPromise(program).then(
  (entries) => console.log(JSON.stringify(entries, null, 2)),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : "Walkthrough generation failed.")
    process.exitCode = 1
  },
)
