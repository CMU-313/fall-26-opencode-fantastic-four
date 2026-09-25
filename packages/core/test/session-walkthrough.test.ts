import { expect, test } from "bun:test"
import { Schema } from "effect"
import { SessionWalkthrough } from "@opencode-ai/core/session/walkthrough"
import { RelativePath } from "@opencode-ai/core/schema"

const diff = {
  path: RelativePath.make("src/greet.ts"),
  status: "modified" as const,
  additions: 1,
  deletions: 1,
  patch: '-return "Hello " + name\n+return `Hello ${name.trim()}`',
}

const explanation = {
  whatChanged: "Trims whitespace from the name before greeting the user.",
  whyChanged: "The user requested consistent greetings for names with surrounding spaces.",
  concepts: ["String normalization", "Template literals"],
}

test("walkthrough entries contain the file, explanation, reason, and concepts", () => {
  const decode = Schema.decodeUnknownSync(SessionWalkthrough.Entry)
  expect(decode({ file: diff.path, ...explanation })).toEqual({ file: diff.path, ...explanation })
  expect(decode({ file: diff.path, ...explanation, concepts: [] }).concepts).toEqual([])
  expect(() => decode({ file: diff.path, ...explanation, whyChanged: "  " })).toThrow()
  expect(() => decode({ file: diff.path, ...explanation, whatChanged: "" })).toThrow()
  expect(() => decode({ file: diff.path, ...explanation, concepts: [""] })).toThrow()
})

test("prompt reuses the existing diff and includes context for the reason", () => {
  expect(JSON.parse(SessionWalkthrough.buildPrompt({ diff, context: "Trim names before greeting." }))).toEqual({
    context: "Trim names before greeting.",
    file: diff.path,
    status: diff.status,
    additions: diff.additions,
    deletions: diff.deletions,
    patch: diff.patch,
  })
})

test("large patches and context are bounded and explicitly marked as truncated", () => {
  const prompt = SessionWalkthrough.buildPrompt({
    diff: { ...diff, patch: "x".repeat(20_000) },
    context: "y".repeat(10_000),
  })
  expect(prompt.length).toBeLessThan(25_000)
  expect(JSON.parse(prompt).patch).toEndWith("[truncated]")
  expect(JSON.parse(prompt).context).toEndWith("[truncated]")
})
