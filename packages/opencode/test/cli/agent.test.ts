import { describe, test, expect } from "bun:test"
import { buildPermissions, AVAILABLE_PERMISSIONS, buildPathPermissions } from "../../src/cli/cmd/agent"
import { PermissionV2 } from "@opencode-ai/core/permission"


// testing the new permissions format (buildPermissions function)
describe("buildPermissions", () => {
    test("build correct permissions for selected rules (read + edit)", () => {
        const selected = ["read", "edit"]
        const res = buildPermissions(selected)
        expect(res.length).toEqual(AVAILABLE_PERMISSIONS.length - 2)
        expect(res).toContainEqual({ action: "bash", resource: "*", effect: "deny" })
        expect(res).toContainEqual({ action: "glob", resource: "*", effect: "deny" })
        expect(res).not.toContainEqual({ action: "read", resource: "*", effect: "deny" })
        expect(res).not.toContainEqual({ action: "edit", resource: "*", effect: "deny" })
    })

    test("if all permissions selected, return empty, no build", () => {
        const selected = AVAILABLE_PERMISSIONS
        const res = buildPermissions(selected)
        expect(res).toEqual([])
    })
    test("if no permissions selected, all permissions denied", () => {
        const selected: string[] = []
        const res = buildPermissions(selected)
        expect(res.length).toEqual(AVAILABLE_PERMISSIONS.length)
    })
})


// testing the new path permissions format (buildPathPermissions function)
describe("buildPathPermissions", () => {
    test("if only denyPaths are given, allow undefined/empty", () => {
        const res = buildPathPermissions(undefined, ["solutions/**"])
        expect(res.length).toEqual(2)
        expect(res).toEqual([{action: "read", resource: "solutions/**", effect: "deny"}, 
                            {action: "edit", resource: "solutions/**", effect: "deny"}])
    })
    test("if only allowPaths are given, deny undefined/empty", () => {
        const res = buildPathPermissions(["solutions/**"], undefined)
        expect(res.length).toEqual(2)
        expect(res).toEqual([{action: "read", resource: "solutions/**", effect: "allow"}, 
                            {action: "edit", resource: "solutions/**", effect: "allow"}])
    })
    test("if both denyPaths and allowPaths are given, ensure ordering is correct", () => {
        const res = buildPathPermissions(["src/**"], ["*"])
        expect(res.findIndex(r => r.effect === "deny")).toBeLessThan(res.findIndex(r => r.effect === "allow"))

        const eff = PermissionV2.evaluate("edit", "src/foo.ts", res)
        expect(eff.effect).toEqual("allow")
        const eva = PermissionV2.evaluate("edit", "other/bar.ts", res)
        expect(eva.effect).toEqual("deny")
    })

    test("if both denyPaths and allowPaths are empty/undefined", () => {
        const res = buildPathPermissions(undefined, undefined)
        expect(res).toEqual([])
    })
})



// test to make sure buildPathPermissions and buildPermission can work together
describe("agent create permission merging", () => {
    test("merges action-level and path-level permissions with correct deny/allow ordering", () => {
        const selected = ["read", "edit"]
        const permissions = buildPermissions(selected)
    
        const allowPaths = ["src/**"]
        const denyPaths = ["*"]
        const pathPermissions = buildPathPermissions(allowPaths, denyPaths)
    
        const allPermissions = [
        ...permissions,
        ...pathPermissions.filter((rule) => rule.effect === "deny"),
        ...pathPermissions.filter((rule) => rule.effect === "allow"),
        ]

    // action-level denies come first
    expect(allPermissions[0]).toEqual({ action: "bash", resource: "*", effect: "deny" })

    // path-level denies come before path-level allows
    const denyIndex = allPermissions.findIndex((r) => r.resource === "*" && r.effect === "deny")
    const allowIndex = allPermissions.findIndex((r) => r.resource === "src/**" && r.effect === "allow")
    expect(denyIndex).toBeLessThan(allowIndex)

    // end-to-end: specific allow overrides broad deny
    const editResult = PermissionV2.evaluate("edit", "src/foo.ts", allPermissions)
    expect(editResult.effect).toEqual("allow")

    const editOutsideResult = PermissionV2.evaluate("edit", "other/bar.ts", allPermissions)
    expect(editOutsideResult.effect).toEqual("deny")

    // bash still denied regardless of path rules (action-level deny, resource "*")
    const bashResult = PermissionV2.evaluate("bash", "anything", allPermissions)
    expect(bashResult.effect).toEqual("deny")
  })
})
