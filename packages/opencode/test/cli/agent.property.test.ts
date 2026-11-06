import { expect, test } from "bun:test"
import fc from "fast-check"
import {
  buildPathPermissions,
  parsePathInput,
} from "../../src/cli/cmd/agent"

import { PermissionV2 } from "@opencode-ai/core/permission"

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

        expect(parsePathInput(noisy)).toEqual(parsePathInput(normal))
      },
    ),
  )
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

        expect(PermissionV2.evaluate("read", file, rules).effect).toBe("deny")
        expect(PermissionV2.evaluate("edit", file, rules).effect).toBe("deny")
      },
    ),
  )
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
        const original = PermissionV2.evaluate("read", file, originalRules).effect

        const withUnrelatedRule = [
          ...originalRules,
          {
            action: "read" as const,
            resource: `${folderB}/**`,
            effect: "deny" as const,
          },
        ]

        const after = PermissionV2.evaluate("read", file, withUnrelatedRule).effect

        expect(after).toBe(original)
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