import { describe, test, expect } from "bun:test"
import fc from "fast-check"
import matter from "gray-matter"
import { PermissionV2 } from "@opencode-ai/core/permission"
import { buildPermissions, buildPathPermissions, explainAccess } from "../../src/cli/cmd/agent"
fc.configureGlobal({ seed: 42 })

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
  test("R1: deny paths block both read and edit access", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("src", "solutions", "docs", "tests"),
        fc.constantFrom("read", "edit"),
        (directory, action) => {
          const pattern = `${directory}/**`
          const filePath = `${directory}/file.ts`
  
          const rules = buildPathPermissions(undefined, [pattern])
  
          const result = PermissionV2.evaluate(action, filePath, rules)
  
          expect(result.effect).toBe("deny")
        },
      ),
    )
  })

  // R2: The order of paths within --deny-paths / --allow-paths does not change
  // what is allowed or denied.
  // Kind: metamorphic
  test("R2: path ordering does not change permission decisions", () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        (reverse) => {
          const allowPaths = ["src/**", "lib/**"]
          const denyPaths = ["solutions/**", "secrets/**"]
  
          const orderedAllow = reverse
            ? [...allowPaths].reverse()
            : allowPaths
  
          const orderedDeny = reverse
            ? [...denyPaths].reverse()
            : denyPaths
  
          const originalRules = buildPathPermissions(allowPaths, denyPaths)
          const shuffledRules = buildPathPermissions(orderedAllow, orderedDeny)
  
          const paths: { path: string; expected: "allow" | "deny" }[] = [
            { path: "src/index.ts", expected: "allow" },
            { path: "lib/utils.ts", expected: "allow" },
            { path: "solutions/answer.ts", expected: "deny" },
            { path: "secrets/key.ts", expected: "deny" },
          ]
  
          for (const { path, expected } of paths) {
            for (const action of ["read", "edit"]) {
              const original = PermissionV2.evaluate(action, path, originalRules)
              const shuffled = PermissionV2.evaluate(action, path, shuffledRules)
  
              expect(original.effect).toBe(expected)
              expect(shuffled.effect).toBe(expected)
              expect(shuffled.effect).toBe(original.effect)
            }
          }
        },
      ),
    )
  })

  // R3 (revised): Rules written to the agent file load back as the same decisions.
  // Kind: round-trip
  test("R3: permissions survive frontmatter serialization and parsing", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            action: fc.constantFrom("read", "edit"),
            resource: fc.constantFrom(
              "src/**",
              "solutions/**",
              "docs/**",
              "tests/**",
            ),
            effect: fc.constantFrom("allow", "deny"),
          }),
          { minLength: 1, maxLength: 10 },
        ),
        (rules) => {
          const frontmatter = {
            description: "Test agent",
            mode: "primary",
            permissions: rules,
          }
  
          const serialized = matter.stringify("Test prompt", frontmatter)
          const parsed = matter(serialized)
  
          for (const rule of rules) {
            const original = PermissionV2.evaluate(
              rule.action,
              rule.resource.replace("/**", "/file.ts"),
              rules,
            )
  
            const restored = PermissionV2.evaluate(
              rule.action,
              rule.resource.replace("/**", "/file.ts"),
              parsed.data.permissions,
            )
  
            expect(restored.effect).toBe(original.effect)
            expect(restored).toEqual(original)
          }
        },
      ),
    )
  })

  // R5 (revised): explainAccess reports the effect of the last matching rule,
  // or "ask" when nothing matches.
  // Kind: model / oracle
  test("R5: explainAccess returns the last matching rule", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("read", "edit"),
        fc.constantFrom(
          "src/index.ts",
          "solutions/answer.ts",
          "docs/readme.md",
        ),
        (action, filePath) => {
          const denyRule = {
            action,
            resource: filePath,
            effect: "deny",
          } as const
  
          const allowRule = {
            action,
            resource: filePath,
            effect: "allow",
          } as const
  
          const rules = [denyRule, allowRule]
  
          const result = explainAccess(rules, action, filePath)
  
          expect(result.effect).toBe("allow")
          expect(result.rule).toEqual(allowRule)
        },
      ),
    )
  })

  test("R5: explainAccess returns ask when no rule matches", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("read", "edit"),
        fc.constantFrom("src/index.ts", "docs/readme.md"),
        (action, filePath) => {
          const result = explainAccess([], action, filePath)
  
          expect(result.effect).toBe("ask")
          expect(result.rule).toEqual({
            action,
            resource: "*",
            effect: "ask",
          })
        },
      ),
    )
  })

  test("buildPathPermissions returns an empty array when no paths are provided", () => {
    const rules = buildPathPermissions(undefined, undefined)
  
    expect(rules).toEqual([])
  })

  test("R1: deny paths generate exactly two deny rules per path", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.stringMatching(/^[a-z][a-z0-9_-]*$/),
          { minLength: 0, maxLength: 20 },
        ),
        (directories) => {
          const denyPaths = directories.map((directory) => `${directory}/**`)
          const rules = buildPathPermissions(undefined, denyPaths)
  
          expect(rules).toHaveLength(denyPaths.length * 2)
  
          for (const path of denyPaths) {
            expect(rules).toContainEqual({
              action: "read",
              resource: path,
              effect: "deny",
            })
            expect(rules).toContainEqual({
              action: "edit",
              resource: path,
              effect: "deny",
            })
          }
        },
      ),
    )
  })
})