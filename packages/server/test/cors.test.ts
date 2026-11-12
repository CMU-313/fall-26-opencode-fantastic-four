import { afterAll, expect, test } from "bun:test"
import { Layer } from "effect"
import { Credential } from "@opencode-ai/core/credential"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { PermissionSaved } from "@opencode-ai/core/permission/saved"
import { SessionV2 } from "@opencode-ai/core/session"
import { SessionExecution } from "@opencode-ai/core/session/execution"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { createRoutes } from "../src/routes"

const server = HttpRouter.toWebHandler(
  createRoutes("test-password").pipe(
    Layer.provide(HttpServer.layerServices),
    Layer.provideMerge(
      AppNodeBuilder.build(LayerNode.group([Credential.node, PermissionSaved.node, SessionV2.node]), [
        [SessionExecution.node, SessionExecution.noopLayer],
      ]),
    ),
  ),
  {
    disableLogger: true,
  },
)

afterAll(() => server.dispose())

for (const [path, method] of [
  ["/api/health", "GET"],
  ["/api/session/ses_test/walkthrough", "POST"],
]) {
  test(`allows browser preflight for ${path} without authentication`, async () => {
    const response = await server.handler(
      new Request(`http://localhost${path}`, {
        method: "OPTIONS",
        headers: {
          origin: "http://localhost:3000",
          "access-control-request-method": method,
          "access-control-request-headers": "authorization, content-type",
        },
      }),
    )
    expect(response.status).toBe(204)
    expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost:3000")
    expect(response.headers.get("access-control-allow-methods")).toContain(method)
    expect(response.headers.get("access-control-allow-headers")).toBe("authorization, content-type")
    expect(response.headers.get("vary")?.toLowerCase()).toContain("origin")
    expect(response.headers.get("vary")?.toLowerCase()).toContain("access-control-request-headers")
  })
}

test("authenticated browser requests reach the health endpoint", async () => {
  const response = await server.handler(
    new Request("http://localhost/api/health", {
      headers: {
        origin: "http://127.0.0.1:3000",
        authorization: `Basic ${btoa("opencode:test-password")}`,
      },
    }),
  )
  expect(response.status).toBe(200)
  expect(response.headers.get("access-control-allow-origin")).toBe("http://127.0.0.1:3000")
  expect(await response.json()).toEqual({ healthy: true })
})

test("authentication errors remain readable to the local UI", async () => {
  const response = await server.handler(
    new Request("http://localhost/api/health", {
      headers: { origin: "http://localhost:3000" },
    }),
  )
  expect(response.status).toBe(401)
  expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost:3000")
})

test("untrusted origins do not receive browser access", async () => {
  const response = await server.handler(
    new Request("http://localhost/api/health", {
      method: "OPTIONS",
      headers: {
        origin: "https://untrusted.example",
        "access-control-request-method": "GET",
        "access-control-request-headers": "authorization",
      },
    }),
  )
  expect(response.headers.get("access-control-allow-origin")).toBeNull()
})
