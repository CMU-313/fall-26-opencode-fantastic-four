import { Context, Effect } from "effect"
import { HttpMiddleware, HttpRouter, HttpServerResponse } from "effect/unstable/http"

const opencodeOrigin = /^https:\/\/([a-z0-9-]+\.)*opencode\.ai$/

export type CorsOptions = { readonly cors?: ReadonlyArray<string> }

export const CorsConfig = Context.Reference<CorsOptions | undefined>("@opencode/ServerCorsConfig", {
  defaultValue: () => undefined,
})

export const cors = (options?: CorsOptions) =>
  HttpRouter.middleware(
    (effect) =>
      HttpMiddleware.cors({
        allowedOrigins: (origin) => isAllowedCorsOrigin(origin, options),
        maxAge: 86_400,
      })(effect).pipe(
        Effect.map((response) => {
          if (!response.headers["access-control-allow-origin"]) return response
          // Effect's preflight middleware overwrites Vary: Origin when echoing requested headers.
          const vary = response.headers.vary
          if (vary?.split(",").some((value) => ["origin", "*"].includes(value.trim().toLowerCase()))) return response
          return HttpServerResponse.setHeader(response, "vary", vary ? `${vary}, Origin` : "Origin")
        }),
      ),
    { global: true },
  )

export function isAllowedCorsOrigin(input: string | undefined, opts?: CorsOptions) {
  if (!input) return true
  if (input.startsWith("http://localhost:")) return true
  if (input.startsWith("http://127.0.0.1:")) return true
  if (input.startsWith("oc://renderer")) return true
  if (input === "tauri://localhost" || input === "http://tauri.localhost" || input === "https://tauri.localhost")
    return true
  if (opencodeOrigin.test(input)) return true
  return opts?.cors?.includes(input) ?? false
}

export function isAllowedRequestOrigin(input: string | undefined, host: string | undefined, opts?: CorsOptions) {
  if (!input) return true
  if (host && sameHost(input, host)) return true
  return isAllowedCorsOrigin(input, opts)
}

function sameHost(origin: string, host: string) {
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}
