import { expect, test } from "bun:test"
import { requestWalkthrough } from "../../src/util/walkthrough"

test("walkthrough uses the selected session, authentication, and validates results", async () => {
  const requests: { path: string; method: string; authorization: string | null }[] = []
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      requests.push({
        path: new URL(request.url).pathname,
        method: request.method,
        authorization: request.headers.get("Authorization"),
      })
      return Response.json({
        data: [
          {
            file: "src/example.ts",
            whatChanged: "Added validation",
            whyChanged: "Reject invalid inputs",
            concepts: [],
          },
        ],
      })
    },
  })
  try {
    const result = await requestWalkthrough({
      url: server.url.toString(),
      sessionID: "ses_selected",
      fetch,
      headers: { Authorization: "Basic test" },
      signal: new AbortController().signal,
    })
    expect(requests).toHaveLength(1)
    expect(requests[0].path).toBe("/api/session/ses_selected/walkthrough")
    expect(requests[0].method).toBe("POST")
    expect(requests[0].authorization).toBe("Basic test")
    expect(result.data[0].file).toBe("src/example.ts")
    expect(result.data[0].concepts).toEqual([])
  } finally {
    await server.stop(true)
  }
})

test("walkthrough handles empty results, unsupported sessions, failed generation, and invalid output", async () => {
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      const path = new URL(request.url).pathname
      if (path.includes("ses_legacy")) return new Response(null, { status: 404 })
      if (path.includes("ses_failed")) return new Response(null, { status: 503 })
      if (path.includes("ses_invalid")) return Response.json({ data: [{ file: "example.ts" }] })
      return Response.json({ data: [] })
    },
  })
  const request = (sessionID: string, signal = new AbortController().signal) =>
    requestWalkthrough({ url: server.url.toString(), sessionID, fetch, signal })
  try {
    expect(await request("ses_empty")).toEqual({ data: [] })
    await expect(request("ses_legacy")).rejects.toThrow("require a V2 session")
    await expect(request("ses_failed")).rejects.toThrow("503")
    await expect(request("ses_invalid")).rejects.toThrow()
    await expect(request("ses_empty", AbortSignal.abort())).rejects.toThrow()
  } finally {
    await server.stop(true)
  }
})
