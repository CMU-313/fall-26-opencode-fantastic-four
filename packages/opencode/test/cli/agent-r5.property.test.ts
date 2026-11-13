import { expect, test } from "bun:test"
import fc from "fast-check"
import { PermissionV2 } from "@opencode-ai/core/permission"
import { buildPathPermissions } from "../../src/cli/cmd/agent"

test("R5: adding a nonmatching path rule leaves the permission decision unchanged", () => {
  const segment = fc.stringMatching(/^[a-z0-9_-]{1,16}$/)
  const relative = fc.array(segment, { minLength: 1, maxLength: 4 }).map((parts) => parts.join("/"))

  fc.assert(
    fc.property(
      relative,
      relative,
      fc.array(fc.constantFrom("exact", "parent", "all", "other"), { maxLength: 12 }),
      fc.array(fc.constantFrom("exact", "parent", "all", "other"), { maxLength: 12 }),
      (requested, unrelated, allow, deny) => {
        const resource = `requested/${requested}`
        const patterns = {
          exact: resource,
          parent: "requested/*",
          all: "*",
          other: `unrelated/${unrelated}`,
        }
        const baselines = [
          { allow: [], deny: [] },
          { allow: [resource], deny: [] },
          { allow: [], deny: [resource] },
          { allow: allow.map((key) => patterns[key]), deny: deny.map((key) => patterns[key]) },
        ]

        // Distinct literal roots guarantee nonmatching patterns even after shrinking.
        for (const pattern of [`unrelated/${unrelated}`, `unrelated/${unrelated}/*`, "unrelated/*"]) {
          for (const baseline of baselines) {
            const before = buildPathPermissions(baseline.allow, baseline.deny)
            for (const effect of ["allow", "deny"] as const) {
              const after = buildPathPermissions(
                effect === "allow" ? [...baseline.allow, pattern] : baseline.allow,
                effect === "deny" ? [...baseline.deny, pattern] : baseline.deny,
              )
              for (const action of ["read", "edit"]) {
                expect(PermissionV2.evaluate(action, resource, after).effect).toBe(
                  PermissionV2.evaluate(action, resource, before).effect,
                )
              }
            }
          }
        }
      },
    ),
    { numRuns: 200 },
  )
})
