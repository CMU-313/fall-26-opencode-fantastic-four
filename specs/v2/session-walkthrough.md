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

The core generator supplies data on demand and does not persist walkthroughs or automatically call a model after every session. Direct callers choose when to generate a walkthrough and which model to use. The structural tests use deterministic provider responses; explanation quality still depends on the selected model.

## Requesting a walkthrough

In an existing session connected to a V2 server, select **Learning walkthrough** from the session commands or use `/walkthrough`. The app opens a dialog and sends `POST /api/session/:sessionID/walkthrough` only after this action. The response is `{ data: Entry[] }`.

The server loads the selected session's chronological message history, excludes messages at and after a staged revert boundary, and resolves the session's configured model in its Location. The request does not admit a prompt, wake or interrupt execution, change the model, or alter messages and snapshots. During active execution, the walkthrough covers completed snapshots available when the request reads history.

The dialog displays loading, empty, and error states, supports explicit retries, and cancels its request when closed or when the selected session changes. The composer draft remains intact. UI strings use English i18n keys with the existing fallback for other locales. Legacy V1 sessions do not enable this action because the generator requires V2 session snapshots.

Each changed file appears in a separate bordered section with its file name, what changed, why it changed, and programming concepts. An empty concepts array displays an explicit message instead of a blank list. Loading and empty results use status announcements; generation failures use an alert and a retry button. Browser regression tests cover single-file and multiple-file results, loading, empty results, retries, and preservation of the composer draft.

The app currently vendors an older client. Its server adapter supplies a typed, authenticated walkthrough request using the configured platform fetch and validates the response with the canonical Schema contract. The workspace client is regenerated with the new endpoint for other consumers.

Focused validation:

```sh
# packages/core
bun test test/session-walkthrough.test.ts test/session-walkthrough-snapshot.test.ts --timeout 30000

# packages/server
bun test --preload ../core/test/preload.ts test/session-walkthrough.test.ts --timeout 30000

# packages/app
bun test --conditions=solid --preload ./happydom.ts src/utils/server.test.ts src/utils/server-compat.test.ts
bunx playwright test e2e/regression/session-walkthrough.spec.ts --workers=1
```

## Print a walkthrough in the terminal

In the TUI, use `/walkthrough` or select **Learning walkthrough** in the session command palette. The dialog uses the same V2 endpoint and displays each file's changes, reason, and programming concepts. Use the arrow keys or Page Up/Page Down to scroll, Escape to close, and `r` to retry a failed request. Closing the dialog or switching sessions cancels the client request. Legacy sessions show an explanation that V2 sessions and a server with walkthrough support are required; this command does not migrate them. The command does not submit a conversational prompt.

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
