import { describe, expect, test } from "bun:test"
import { authFromToken, authTokenFromCredentials } from "./server"

describe("authFromToken", () => {
  test("decodes basic auth credentials from auth_token", () => {
    expect(authFromToken(btoa("kit:secret"))).toEqual({ username: "kit", password: "secret" })
  })

  test("defaults blank username to opencode", () => {
    expect(authFromToken(btoa(":secret"))).toEqual({ username: "opencode", password: "secret" })
  })

  test("ignores malformed tokens", () => {
    expect(authFromToken("not base64")).toBeUndefined()
    expect(authFromToken(btoa("missing-separator"))).toBeUndefined()
  })
})

describe("authTokenFromCredentials", () => {
  test("encodes credentials with the default username", () => {
    expect(authTokenFromCredentials({ password: "secret" })).toBe(btoa("opencode:secret"))
  })
})

test("walkthrough requests are explicit, authenticated, and use the selected session", async () => {
  const { createApiForServer } = await import("./server")
  const requests: Request[] = []
  const entry = { file: "greet.ts", whatChanged: "Trims names", whyChanged: "Requested", concepts: [] }
  const fetcher = Object.assign(
    async (input: string | URL | Request, init?: RequestInit) => {
      requests.push(new Request(input, init))
      return Response.json({ data: [entry] })
    },
    { preconnect: fetch.preconnect },
  )
  const api = createApiForServer({ server: { url: "http://localhost:4096", password: "secret" }, fetch: fetcher })
  expect(requests).toHaveLength(0)
  const controller = new AbortController()
  expect(await api.session.walkthrough({ sessionID: "ses_current" }, { signal: controller.signal })).toEqual({
    data: [entry],
  })
  expect(requests).toHaveLength(1)
  expect(requests[0].url).toBe("http://localhost:4096/api/session/ses_current/walkthrough")
  expect(requests[0].method).toBe("POST")
  expect(requests[0].headers.get("Authorization")).toBe(`Basic ${btoa("opencode:secret")}`)
  controller.abort()
  expect(requests[0].signal.aborted).toBe(true)
})
