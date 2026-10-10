import { SessionV2 } from "@opencode-ai/core/session"
import { SessionWalkthrough } from "@opencode-ai/core/session/walkthrough"
import { SessionRunnerModel } from "@opencode-ai/core/session/runner/model"
import { Effect } from "effect"

export const requestWalkthrough = Effect.fn("Server.requestWalkthrough")(function* (sessionID: SessionV2.ID) {
  const sessions = yield* SessionV2.Service
  const session = yield* sessions.get(sessionID)
  const messages = yield* sessions.messages({ sessionID, order: "asc" })
  const boundary = session.revert ? messages.findIndex((message) => message.id === session.revert?.messageID) : -1
  const visible = boundary < 0 ? messages : messages.slice(0, boundary)
  if (
    !visible.some(
      (message) =>
        message.type === "assistant" &&
        message.snapshot?.start &&
        message.snapshot.end &&
        message.snapshot.files?.length,
    )
  )
    return []

  const models = yield* SessionRunnerModel.Service
  const model = yield* models.resolve(session)
  return yield* SessionWalkthrough.fromMessages({ messages: visible, model })
})
