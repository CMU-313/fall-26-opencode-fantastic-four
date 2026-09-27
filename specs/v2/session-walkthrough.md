# Structured change walkthroughs

`SessionWalkthrough` in `packages/core/src/session/walkthrough.ts` generates educational explanations on demand. It returns one serializable entry per changed file:

```json
{
  "file": "src/greet.ts",
  "whatChanged": "Trims whitespace from the name before building the greeting.",
  "whyChanged": "The user requested consistent greetings for names with surrounding spaces.",
  "concepts": ["String normalization", "Template literals"]
}
```

## Calling from a session

Use the existing session messages in chronological order. Run the effect with `Snapshot.Service` bound to the session's Location and pass a resolved LLM model:

```ts
import { Effect } from "effect"
import { SessionV2 } from "@opencode-ai/core/session"
import { SessionWalkthrough } from "@opencode-ai/core/session/walkthrough"

const walkthrough = Effect.gen(function* () {
  const sessions = yield* SessionV2.Service
  const messages = yield* sessions.messages({ sessionID, order: "asc" })
  return yield* SessionWalkthrough.fromMessages({ messages, model })
})
```

The adapter compares the first completed assistant snapshot's start with the last completed snapshot's end. It keeps only paths already recorded in those messages' `snapshot.files`. Files whose changes were subsequently undone disappear from the net diff. It neither captures new snapshots nor reads the current working tree to infer additional changes. Sessions without completed snapshots or tracked changes return `[]`.

Callers that already have `File.Diff[]` can call `SessionWalkthrough.generate({ diffs, context, model })` directly. `context` should contain the relevant user request and implementation explanation. Empty diffs return `[]` without contacting the model.

## Generation behavior

- One sequential structured-output request per file, preserving input order and using the tracked path as the file identity.
- Required, nonblank explanations and reason; concepts are an array of nonblank strings and may be empty when no concept applies.
- The prompt asks for short explanations grounded in the patch and conversation, and explicitly identified uncertainty when the reason is not known.
- Only user text and assistant text are included from session messages; reasoning and tool output are omitted. Context is capped at 8,000 characters and each patch at 16,000, with explicit truncation markers. Binary or unavailable patches are described with limited evidence.
- Invalid model output and provider errors fail the effect rather than returning fabricated or partial results. Snapshot errors also propagate to the caller.

This increment supplies core data generation. It does not add a UI, HTTP endpoint, persistence, or an automatic model call after every session. Callers choose when to generate a walkthrough and which model to use. The structural tests use deterministic provider responses; explanation quality still depends on the selected model.

## Print a walkthrough in the terminal

From the repository root, run:

```sh
bun run --cwd packages/core walkthrough:demo
```

This calls `SessionWalkthrough.generate` with the example in `packages/core/script/walkthrough-demo.json` and prints formatted JSON containing `file`, `whatChanged`, `whyChanged`, and `concepts`. The input and a mode label go to stderr; the JSON result goes to stdout.

**The default is sample mode:** it feeds a fixed provider response through the real generator and structured-output decoder. It needs no credentials or network connection. This demonstrates the output shape; it does not measure AI explanation quality.

To see an empty result or save the JSON:

```sh
bun run --cwd packages/core walkthrough:demo --empty
bun run --cwd packages/core walkthrough:demo > /tmp/walkthrough.json
```

### Real AI-generated explanations

Use `--live` and the exact name of a model available to your account. OpenAI-compatible models must support Chat Completions tool calls. The script reads a provider API key from your terminal environment, not the OpenCode server password or saved application credentials.

```sh
# With OPENAI_API_KEY already set:
bun run --cwd packages/core walkthrough:demo --live --provider openai --model YOUR_MODEL_NAME

# With ANTHROPIC_API_KEY already set:
bun run --cwd packages/core walkthrough:demo --live --provider anthropic --model YOUR_MODEL_NAME
```

Live mode makes a real provider request, prints the validated result, and fails rather than substituting the sample response if generation fails. Requests time out after 90 seconds. Use `--base-url` for a compatible local or custom API; include its API path, for example `http://localhost:1234/v1/`. Local APIs may omit the API key.

To try another change, copy or edit `packages/core/script/walkthrough-demo.json`, then pass `--input /path/to/input.json` with `--live`. The JSON must have `context` and a `diffs` array using the existing `File.Diff` shape. Sample mode rejects custom input because its fixed explanation only describes the built-in example. `--empty` replaces the diffs with `[]` and never calls the model.

When reviewing real output, compare it with the printed input: does it describe the actual code change, connect the reason to the user request, and name concepts used by the changed code? The demo exercises the generator directly; no server, web UI, or stored session is required.
