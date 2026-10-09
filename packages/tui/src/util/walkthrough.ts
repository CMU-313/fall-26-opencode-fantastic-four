import { SessionWalkthrough } from "@opencode-ai/core/session/walkthrough"
import { Schema } from "effect"

export async function requestWalkthrough(input: {
  url: string
  sessionID: string
  fetch: typeof fetch
  headers?: RequestInit["headers"]
  signal: AbortSignal
}) {
  const response = await input.fetch(
    `${input.url.replace(/\/$/, "")}/api/session/${encodeURIComponent(input.sessionID)}/walkthrough`,
    { method: "POST", headers: input.headers, signal: input.signal },
  )
  if (response.status === 404)
    throw new Error("Learning walkthroughs require a V2 session and a server with walkthrough support.")
  if (!response.ok) throw new Error(`The learning walkthrough could not be generated (${response.status}).`)
  return Schema.decodeUnknownSync(Schema.Struct({ data: Schema.Array(SessionWalkthrough.Entry) }))(
    await response.json(),
  )
}
