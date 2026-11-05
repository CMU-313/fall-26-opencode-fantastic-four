import { describe, test, expect } from "bun:test"
import fc from "fast-check"
import matter from "gray-matter"
import { PermissionV2 } from "@opencode-ai/core/permission"
import { buildPermissions, buildPathPermissions, explainAccess } from "../../src/cli/cmd/agent"

// Generators: a tiny shared alphabet of segments so generated patterns and
// probe paths actually overlap. Random strings would almost never match, and
// every property would pass vacuously on the default "ask".
const segment = fc.constantFrom("src", "solutions", "tests", "a", "b")
const pattern = fc
  .tuple(fc.array(segment, { minLength: 1, maxLength: 2 }), fc.constantFrom("", "/*", "/**"))
  .map(([segs, suffix]) => segs.join("/") + suffix)
const patterns = fc.array(pattern, { minLength: 1, maxLength: 5 })
const filePath = fc.array(segment, { minLength: 1, maxLength: 3 }).map((s) => s.join("/") + ".ts")
const action = fc.constantFrom("read", "edit")
// Turns a pattern into a path it should cover: "src/**" -> "src/x.ts"
const concrete = (p: string) => p.replace(/\*+$/, "x.ts")

describe("agent create path rules (properties)", () => {
  // R1: A path matched by --deny-paths is blocked for both read and edit.
  // Kind: invariant
  test("R1: denied paths are blocked for read and edit", () => {
    fc.assert(
      fc.property(patterns, action, (deny, act) => {
        const rules = buildPathPermissions(undefined, deny)
        for (const p of deny) expect(PermissionV2.evaluate(act, concrete(p), rules).effect).toBe("deny")
      }),
    )
  })

  // R2: The order of paths within --deny-paths / --allow-paths does not change
  // what is allowed or denied.
  // Kind: metamorphic
  test("R2: path order within a flag does not change decisions", () => {
    const shuffled = (arb: fc.Arbitrary<string[]>) =>
      arb.chain((xs) =>
        fc.tuple(fc.constant(xs), fc.shuffledSubarray(xs, { minLength: xs.length, maxLength: xs.length })),
      )
    fc.assert(
      fc.property(shuffled(patterns), shuffled(patterns), filePath, action, ([a1, a2], [d1, d2], file, act) => {
        const r1 = buildPathPermissions(a1, d1)
        const r2 = buildPathPermissions(a2, d2)
        expect(PermissionV2.evaluate(act, file, r1).effect).toBe(PermissionV2.evaluate(act, file, r2).effect)
      }),
    )
  })

  // R3 (revised): Rules written to the agent file load back as the same decisions.
  // Kind: round-trip
  test("R3: rules written to frontmatter and parsed back decide identically", () => {
    fc.assert(
      fc.property(fc.option(patterns, { nil: undefined }), fc.option(patterns, { nil: undefined }), filePath, action, (allow, deny, file, act) => {
        const rules = [...buildPermissions(["read", "edit"]), ...buildPathPermissions(allow, deny)]
        const parsed = matter(matter.stringify("body", { permissions: rules })).data.permissions
        expect(PermissionV2.evaluate(act, file, parsed).effect).toBe(PermissionV2.evaluate(act, file, rules).effect)
      }),
    )
  })

  // R5 (revised): explainAccess reports the effect of the last matching rule,
  // or "ask" when nothing matches.
  // Kind: model / oracle
  test("R5: explainAccess agrees with a simple last-match model", () => {
    // Exact paths and "*" only, so the model needs no glob logic of its own.
    const pool = fc.constantFrom("src/a.ts", "src/b.ts", "solutions/a.ts")
    const rule = fc.record({
      action,
      resource: fc.oneof(pool, fc.constant("*")),
      effect: fc.constantFrom("allow", "deny", "ask" as const),
    })
    fc.assert(
      fc.property(fc.array(rule, { maxLength: 8 }), action, pool, (rules, act, p) => {
        const hit = [...rules].reverse().find((r) => r.action === act && (r.resource === p || r.resource === "*"))
        expect(explainAccess(rules, act, p).effect).toBe(hit ? hit.effect : "ask")
      }), { verbose: 2 },
    )
  })
})