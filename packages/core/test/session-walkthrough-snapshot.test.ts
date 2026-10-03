import { $ } from "bun"
import { expect, test } from "bun:test"
import path from "path"
import { Effect, Schema } from "effect"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { Global } from "@opencode-ai/core/global"
import { Location } from "@opencode-ai/core/location"
import { AbsolutePath, RelativePath } from "@opencode-ai/core/schema"
import { SessionMessage } from "@opencode-ai/core/session/message"
import { SessionWalkthrough } from "@opencode-ai/core/session/walkthrough"
import { Snapshot } from "@opencode-ai/core/snapshot"
import { OpenAIChat } from "@opencode-ai/llm/protocols/openai-chat"
import { Auth } from "@opencode-ai/llm/route"
import { dynamicResponse } from "../../llm/test/lib/http"
import { finishChunk, toolCallChunk } from "../../llm/test/lib/openai-chunks"
import { sseEvents } from "../../llm/test/lib/sse"
import { tmpdir } from "./fixture/tmpdir"

const model = OpenAIChat.route
  .with({ endpoint: { baseURL: "https://api.openai.test/v1/" }, auth: Auth.bearer("test") })
  .model({ id: "gpt-4o-mini" })

const user = Schema.decodeUnknownSync(SessionMessage.User)({
  id: "msg_user",
  text: "Replace the old greeting with one that trims names.",
  time: { created: 0 },
  type: "user",
})

function assistant(snapshot?: SessionMessage.Assistant["snapshot"]) {
  return Schema.decodeUnknownSync(SessionMessage.Assistant)({
    id: SessionMessage.ID.create(),
    type: "assistant",
    agent: "build",
    model: { id: "gpt-4o-mini", providerID: "openai" },
    content: [{ type: "text", id: "text_1", text: "I replaced the obsolete greeting function." }],
    time: { created: 1, completed: 2 },
    ...(snapshot ? { snapshot } : {}),
  })
}

test("sessions without completed tracked changes skip snapshots and the model", async () => {
  for (const messages of [[], [user], [user, assistant()], [user, assistant({ start: "pending" })]]) {
    expect(
      await Effect.runPromise(
        SessionWalkthrough.fromMessages({ messages, model }).pipe(Effect.provide(Snapshot.noopLayer)),
      ),
    ).toEqual([])
  }
})

test("walkthrough uses existing session snapshots, excludes untracked paths, and skips net-empty diffs", async () => {
  await using tmp = await tmpdir()
  const directory = path.join(tmp.path, "project")
  await Bun.write(path.join(directory, "old.ts"), 'export const greet = () => "hello"\n')
  await Bun.write(path.join(directory, "untouched.ts"), 'export const value = "before"\n')
  await Bun.write(path.join(directory, "reverted.ts"), "export const unchanged = true\n")
  await $`git init`.cwd(directory).quiet()
  await $`git config core.fsmonitor false`.cwd(directory).quiet()
  await $`git add .`.cwd(directory).quiet()
  await $`git -c user.name=Test -c user.email=test@opencode.test -c commit.gpgsign=false commit -m initial`
    .cwd(directory)
    .quiet()

  const requests: string[] = []
  await Effect.runPromise(
    Effect.gen(function* () {
      const snapshot = yield* Snapshot.Service
      const before = yield* snapshot.capture()
      expect(before).toBeDefined()
      if (!before) return
      yield* Effect.promise(async () => {
        await Bun.file(path.join(directory, "old.ts")).delete()
        await Bun.write(
          path.join(directory, "new.ts"),
          "export const greet = (name: string) => `Hello ${name.trim()}`\n",
        )
        await Bun.write(path.join(directory, "untouched.ts"), 'export const value = "unrelated change"\n')
      })
      const after = yield* snapshot.capture()
      expect(after).toBeDefined()
      if (!after) return

      const changed = assistant({
        start: before,
        end: after,
        files: [RelativePath.make("old.ts"), RelativePath.make("new.ts"), RelativePath.make("reverted.ts")],
      })
      const messages = [user, changed]
      const entries = yield* SessionWalkthrough.fromMessages({ messages, model })
      expect(entries.map((entry) => entry.file)).toEqual(["new.ts", "old.ts"])
      expect(requests).toHaveLength(2)
      expect(requests[0]).toContain("Replace the old greeting")
      expect(requests[0]).toContain("I replaced the obsolete greeting")
      expect(requests[0]).toContain("name.trim()")
      expect(requests[1]).toContain("deleted")
      expect(requests.join("\n")).not.toContain("unrelated change")

      expect(
        yield* SessionWalkthrough.fromMessages({
          messages: [user, assistant({ ...changed.snapshot, start: before, end: before })],
          model,
        }),
      ).toEqual([])
      expect(requests).toHaveLength(2)
    }).pipe(
      Effect.provide(
        AppNodeBuilder.build(Snapshot.node, [
          [Location.node, Location.boundNode(Location.Ref.make({ directory: AbsolutePath.make(directory) }))],
          [Global.node, Global.layerWith({ data: tmp.path, config: path.join(tmp.path, "config") })],
        ]),
      ),
      Effect.provide(
        dynamicResponse((input) => {
          requests.push(input.text)
          return Effect.succeed(
            input.respond(
              sseEvents(
                toolCallChunk(
                  "call_1",
                  "generate_object",
                  JSON.stringify({
                    whatChanged: "Replaces the old greeting implementation.",
                    whyChanged: "The user requested trimmed names.",
                    concepts: ["String normalization"],
                  }),
                ),
                finishChunk("tool_calls"),
              ),
              { headers: { "content-type": "text/event-stream" } },
            ),
          )
        }),
      ),
      Effect.scoped,
    ),
  )
})
