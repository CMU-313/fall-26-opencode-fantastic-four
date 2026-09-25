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
