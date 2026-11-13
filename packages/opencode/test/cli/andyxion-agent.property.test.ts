import { expect, test } from "bun:test"
import fc from "fast-check"
import {
  buildPathPermissions,
  parsePathInput,
} from "../../src/cli/cmd/agent"

import { PermissionV2 } from "@opencode-ai/core/permission"

fc.configureGlobal({ seed: 42 })

// R6: Path-list input must trim surrounding whitespace and ignore blank
// entries without changing valid path order.
// Kind: metamorphic
test("R6: whitespace and blank entries do not change parsed paths", () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.stringMatching(/^[a-z]{1,8}$/).map((name) => `${name}/**`),
        { minLength: 1, maxLength: 5 },
      ),
      (paths) => {
        const normal = paths.join(",")
        const noisy = paths.map((path) => ` ${path} `).join(", ,")

        // Both forms must parse to the actual expected path list.
        expect(parsePathInput(normal)).toEqual(paths)
        expect(parsePathInput(noisy)).toEqual(paths)
      },
    ),
  )
})

// R6: Inputs containing no valid paths must produce no path restrictions.
// Kind: invariant
test("R6: blank-only path inputs produce no paths", () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.constantFrom("", " ", "  ", "\t", "\n"),
        { minLength: 0, maxLength: 5 },
      ),
      (parts) => {
        const input = parts.join(",")
        expect(parsePathInput(input)).toBeUndefined()
      },
    ),
  )

  expect(parsePathInput(undefined)).toBeUndefined()
})

// R1: A denied read or edit must stop before accessing or modifying the file.
// Kind: invariant
test("R1: matching deny rules remain denied", () => {
  fc.assert(
    fc.property(
      fc.stringMatching(/^[a-z]{1,8}$/),
      (folder) => {
        const pattern = `${folder}/**`
        const file = `${folder}/file.ts`

        const rules = buildPathPermissions(undefined, [pattern])

        expect(rules).toEqual([
          { action: "read", resource: pattern, effect: "deny" },
          { action: "edit", resource: pattern, effect: "deny" },
        ])

        expect(PermissionV2.evaluate("read", file, rules).effect).toBe("deny")
        expect(PermissionV2.evaluate("edit", file, rules).effect).toBe("deny")
      },
    ),
  )
})

// R1: Missing deny paths must not create deny rules or throw.
// Kind: invariant
test("R1: undefined deny paths are handled safely", () => {
  fc.assert(
    fc.property(
      fc.stringMatching(/^[a-z]{1,8}$/),
      (folder) => {
        const pattern = `${folder}/**`

        expect(() => buildPathPermissions([pattern], undefined)).not.toThrow()

        expect(buildPathPermissions([pattern], undefined)).toEqual([
          { action: "read", resource: pattern, effect: "allow" },
          { action: "edit", resource: pattern, effect: "allow" },
        ])
      },
    ),
  )

  expect(buildPathPermissions(undefined, undefined)).toEqual([])
})

// R5: Adding a rule that does not match a requested path must leave
// that request's permission decision unchanged.
// Kind: metamorphic
test("R5: unrelated rules do not change permission decisions", () => {
  fc.assert(
    fc.property(
      fc.stringMatching(/^[a-z]{1,8}$/),
      fc.stringMatching(/^[a-z]{1,8}$/),
      (folderA, folderB) => {
        fc.pre(folderA !== folderB)

        const file = `${folderA}/file.ts`

        const originalRules = buildPathPermissions([`${folderA}/**`], ["*"])

        const originalRead = PermissionV2.evaluate("read", file, originalRules).effect
        const originalEdit = PermissionV2.evaluate("edit", file, originalRules).effect

        expect(originalRead).toBe("allow")
        expect(originalEdit).toBe("allow")

        const withUnrelatedRule = [
          ...originalRules,
          {
            action: "read" as const,
            resource: `${folderB}/**`,
            effect: "deny" as const,
          },
        ]

        const afterRead = PermissionV2.evaluate("read", file, withUnrelatedRule).effect
        const afterEdit = PermissionV2.evaluate("edit", file, withUnrelatedRule).effect

        expect(afterRead).toBe("allow")
        expect(afterEdit).toBe("allow")

        expect(afterRead).toBe(originalRead)
        expect(afterEdit).toBe(originalEdit)
      },
    ),
  )
})

type Effect = "allow" | "deny" | "ask"

function modelEvaluate(
  action: string,
  resource: string,
  rules: { action: string; resource: string; effect: Effect }[],
): Effect {
  let result: Effect = "ask"

  for (const rule of rules) {
    const actionMatches = rule.action === "*" || rule.action === action
    const resourceMatches = rule.resource === "*" || rule.resource === resource

    if (actionMatches && resourceMatches) {
      result = rule.effect
    }
  }

  return result
}

// R8: When multiple permission rules match the same action and resource,
// the last matching rule determines the permission effect.
// Kind: model/oracle
test("R8: evaluator agrees with last-match-wins reference model", () => {
  fc.assert(
    fc.property(
      fc.constantFrom("read", "edit"),
      fc.stringMatching(/^[a-z]{1,8}$/).map((folder) => `${folder}/file.ts`),
      fc.array(
        fc.record({
          action: fc.constantFrom("*", "read", "edit"),
          resource: fc.oneof(
            fc.constant("*"),
            fc.stringMatching(/^[a-z]{1,8}$/).map((folder) => `${folder}/file.ts`),
          ),
          effect: fc.constantFrom<Effect>("allow", "deny", "ask"),
        }),
        { minLength: 0, maxLength: 10 },
      ),
      (action, resource, rules) => {
        const actual = PermissionV2.evaluate(action, resource, rules).effect
        const expected = modelEvaluate(action, resource, rules)

        expect(actual).toBe(expected)
      },
    ),
  )
})