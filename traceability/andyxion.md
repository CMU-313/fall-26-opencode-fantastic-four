# Traceability: Andy Xiong (andyxion)

**Target feature:** Path-based allow/deny permissions for OpenCode agents.

Main source files:
- `packages/opencode/src/cli/cmd/agent.ts`
- `packages/core/src/permission.ts`

## Requirements

| ID | Interview evidence | Requirement | Acceptance Criteria | Changed in P4? | Property (kind) | Test | Mutants it kills |
|---|---|---|---|---|---|---|---|
| R1 | C-2, S-2, O-2 | A matching deny rule for a read or edit operation must resolve to `deny` when no later matching rule overrides it. | Given a deny rule for a generated path, both `read` and `edit` on a matching file evaluate to `deny`. | Yes | Matching deny rules remain denied (invariant) | `packages/opencode/test/cli/andyxion-agent.property.test.ts` — `R1: matching deny rules remain denied` | H1 |
| R2 | C-3, S-3, O-3 | For the same resource, read and edit may resolve to different permission effects when separate rules are configured. | Given `read=allow` and `edit=deny` for the same resource, reading evaluates to `allow` while editing evaluates to `deny`. | Yes | Not property-tested in P4 | — | — |
| R3 | C-4, S-4, O-4 | Saving and reloading an agent must preserve its ordered rules and permission decisions. | After saving and reloading an agent, the same action/path combinations produce the same permission decisions. | No | Not property-tested in P4 | — | — |
| R4 | C-5, S-5, O-5 | Adding and then removing a rule must restore the original permission behavior after reload. | Add a temporary deny rule, verify that the relevant permission changes, remove the rule, reload, and verify that the original behavior returns. | No | Not property-tested in P4 | — | — |
| R5 | C-6, S-6, O-6 | Adding a rule that does not match a requested path must leave that request's permission decision unchanged. | For any two distinct generated folders, adding a deny rule for one folder does not change the existing permission decision for a file in the other folder. | No | Adding an unrelated rule preserves the original decision (metamorphic) | `packages/opencode/test/cli/andyxion-agent.property.test.ts` — `R5: unrelated rules do not change permission decisions` | H2 |
| R6 | C-7, O-7 | Path-list input must trim surrounding whitespace and ignore blank entries without changing the order of valid paths. | For any generated list of valid path patterns, adding surrounding whitespace and blank comma-separated entries produces the same parsed path list as the clean input. | No | Whitespace and blank entries preserve parsed valid paths (metamorphic) | `packages/opencode/test/cli/andyxion-agent.property.test.ts` — `R6: whitespace and blank entries do not change parsed paths` | H3, H5 |
| R7 | C-9, O-2, S-9, O-9 | The interface must distinguish denial from approval requests and identify the action and path involved. | A denied action is not presented as an approval request, while an `ask` result waits for user approval and identifies the relevant action and path. | No | Not property-tested in P4 | — | — |
| R8 | S-7, S-8 | When multiple permission rules match the same action and resource, the last matching rule determines the permission effect. | For any generated ordered rule set, `PermissionV2.evaluate()` returns the same result as a reference implementation that applies matching rules in order and keeps the effect of the final match. | Yes | Evaluator agrees with a last-match-wins reference model (model/oracle) | `packages/opencode/test/cli/andyxion-agent.property.test.ts` — `R8: evaluator agrees with last-match-wins reference model` | H2, H4 |

Properties written or suggested by an AI tool: R1, R5, R6, R8.

## Requirement Changes

| ID | Original requirement (P3) | Revised requirement | Why it changed |
|---|---|---|---|
| R1 | A denied read or edit must stop before accessing file contents or changing the file. | A matching deny rule for a read or edit operation must resolve to `deny` when no later matching rule overrides it. | The original wording included downstream filesystem behavior that is outside the scope of the permission evaluator being property-tested. The revised requirement preserves the user's expectation that denied access is blocked while making the behavior directly and automatically checkable. |
| R2 | Users must be able to configure read and edit permissions independently for the same path. | For the same resource, read and edit may resolve to different permission effects when separate rules are configured. | The current `agent create` path interface generates both read and edit rules together, but the underlying evaluator supports independent actions. The revised requirement preserves the user need while matching the behavior that can actually be configured and tested at the permission layer. |
| R8 | The agent-creation interface must explain last-match-wins, including that generated allows follow generated denies. | When multiple permission rules match the same action and resource, the last matching rule determines the permission effect. | The original requirement mixed UI/documentation behavior with permission semantics. The revised version captures the deterministic behavior users need and can be checked automatically against a reference model. |

## Property Test Triage

R6 initially failed when run against the existing implementation. fast-check shrank the failing case to `["a/**", "a/**"]`. The generated noisy input inserted a blank comma-separated entry, and `parsePathInput()` returned an empty string as one of the parsed paths instead of ignoring it.

I classified this as a code bug because the R6 requirement explicitly states that blank entries should be ignored. I updated `parsePathInput()` to filter out empty entries after trimming and to return `undefined` if no valid paths remain. After the fix, R6 passed along with R1, R5, and R8.

## Hand-written mutants

| ID | Requirement targeted | Change | Predicted killer | Actual result |
|---|---|---|---|---|
| H1 | R1 | Changed the generated `edit` rule for denied paths from `deny` to `allow`. | R1 should kill it because R1 checks both read and edit on matching denied paths. | Killed by R1. fast-check shrank the failing input to folder `"a"`. |
| H2 | R5 | Removed resource matching from `PermissionV2.evaluate`, so rules with the correct action can affect unrelated paths. | R5 should kill it because unrelated path rules must not change the original path's decision. | Killed by R5 and R8. R5 shrank to folders `"a"` and `"b"`; R8 found a rule for `b/file.ts` incorrectly affecting `a/file.ts`. |
| H3 | R6 | Removed filtering of blank entries from `parsePathInput`. | R6 should kill it because blank comma-separated entries should not appear in the parsed path list. | Killed by R6. fast-check shrank the failing case to `["a/**","a/**"]`. |
| H4 | R8 | Changed permission evaluation from last matching rule to first matching rule. | R8 should kill it because the reference model applies last-match-wins semantics. | Killed by R8. fast-check shrank the case to two matching wildcard rules where the first effect was `allow` and the second was `ask`. |
| H5 | R6 | Replaced full `trim()` with logic that removes only one surrounding space. | I predicted R6 might survive because the generator adds one ordinary space around each path. | Killed by R6. The mutant removed only the leading space when both sides contained whitespace, leaving the trailing space; fast-check shrank the failure to `["a/**"]`. |

## Stryker Comparison

- fast-check seed: `42`
- Initial mutation score: `47.83%` (22 killed, 24 survived)
- Final Stryker mutation score: `91.30%` (42 killed, 4 survived)
- Mutation score excluding equivalent mutants: `100%`

The initial Stryker run exposed weaknesses in my properties around allowed paths and empty path input. In particular, R5 only checked that adding an unrelated rule preserved the previous result, so it could pass even when both the original and modified result were incorrectly `deny`. R6 similarly compared two parser results without asserting that either result was actually correct.

I strengthened R5 to require the baseline and resulting `read` and `edit` decisions to both be `allow`. I strengthened R6 to compare parser output directly against the generated expected path list and added a property for blank-only input. I also strengthened R1 to verify the exact deny rules produced by `buildPathPermissions`. After these changes, the score increased from `47.83%` to `91.30%`.

### Hand-written mutants Stryker did not generate

H2 and H4 modified `packages/core/src/permission.ts`, while my Stryker configuration intentionally mutated only the relevant portion of `packages/opencode/src/cli/cmd/agent.ts`. Therefore, Stryker never generated equivalents of H2, which removed resource matching from permission evaluation, or H4, which changed last-match-wins behavior to first-match-wins.

H5 was also more domain-specific than Stryker's generated mutations. It replaced full `trim()` behavior with an implementation that removed only one side of surrounding whitespace. Stryker generated simpler mutations to the parser, but not this exact partial-trimming defect.

H1 and H3 had close automated equivalents. Stryker generated mutations that broke generated allow/deny rules and mutations that changed or removed the filtering of blank path entries.

### Unexpected Stryker survivors

The most useful survivors from the first run were mutations that completely broke the allow branch while still passing R5. I originally expected R5 to provide strong coverage because it compared a decision before and after adding an unrelated rule, but the property did not verify that the starting decision was actually correct. If both results incorrectly became `deny`, the property still passed.

Stryker also found several parser mutations that returned `undefined` or filtered every path. These survived because the original R6 property only checked that noisy and clean inputs produced the same result. Returning the same incorrect result for both inputs was enough to satisfy the property.

These are bugs that a developer could plausibly introduce because the code would still appear internally consistent even though the observable behavior was wrong.

### Comparison of approaches

The hand-written mutants were better at representing feature-specific mistakes that I could imagine a developer making. For example, H2 removed resource matching entirely and H4 changed rule precedence from last-match-wins to first-match-wins. These mutations directly targeted the semantics discussed in my requirements.

Stryker was better at systematically finding assumptions that my properties failed to assert. In particular, it exposed that R5 only checked relative behavior rather than the correctness of the baseline result, and that R6 allowed two equally incorrect parser outputs to satisfy the property.

The two approaches were complementary: hand-written mutants exercised domain-specific failure modes, while Stryker explored many small implementation changes that revealed weaknesses in my test oracles.

### Equivalent mutants

Four Stryker mutants survived the final run.

For the deny branch, changing:

`denyPaths.length > 0`

to either:

`denyPaths.length >= 0`

or:

`true`

while retaining the surrounding `denyPaths &&` check does not change observable behavior. A non-empty array enters the loop in both versions. An empty array enters the block in the mutant but executes zero loop iterations, producing the same rules, while `undefined` is still stopped by the left side of `&&`.

The two equivalent allow-branch mutants have the same reasoning. Changing `allowPaths.length > 0` to `allowPaths.length >= 0` or `true` may cause an empty array to enter the block, but iterating over an empty array performs no operations. Non-empty and undefined inputs therefore produce exactly the same permission rules as the original implementation.

Because all 4 remaining survivors are equivalent, the effective mutation score excluding equivalent mutants is `100%`.

## Agent Failure Case

### OpenCode transcript

Prompt:

> R5 says: "Adding a rule that does not match a requested path must leave that request's permission decision unchanged."
>
> Write a fast-check property-based test for this requirement using `buildPathPermissions` and `PermissionV2.evaluate`. Do not use my existing property test as a reference.

OpenCode response:

> Added `agent-r5.property.test.ts`.
>
> It runs 200 generated cases covering `read`/`edit`, allow/deny additions, and starting decisions of `ask`, `allow`, and `deny`. Distinct path roots guarantee added patterns never match.
>
> I did not read your existing property test. Execution is blocked because `bun` is unavailable.

OpenCode generated the property in `packages/opencode/test/cli/agent-r5.property.test.ts`.

### Surviving mutant

I tested the OpenCode-generated property against a mutation to `buildPathPermissions` that changed the generated edit-allow rule from:

```ts
permissions.push({ action: "edit", resource: path, effect: "allow" })
```

to:

```ts
permissions.push({ action: "", resource: path, effect: "allow" })
```

With this mutant applied, the OpenCode-generated property still passed:

```text
1 pass
0 fail
9600 expect() calls
```

### Why the OpenCode property was too weak

The OpenCode-generated property checked only that adding a nonmatching rule preserved the previous permission decision:

```ts
expect(PermissionV2.evaluate(action, resource, after).effect).toBe(
  PermissionV2.evaluate(action, resource, before).effect,
)
```

This checks that the before and after results are equal, but it does not verify that the original result itself is correct.

With the mutant, an edit that should evaluate to `allow` instead evaluates to `ask`. Since the result is `ask` both before and after the unrelated rule is added, the OpenCode-generated property still passes.

### Strengthened property

I strengthened R5 by explicitly checking that the original `read` and `edit` decisions are both `allow`, and that they remain `allow` after adding the unrelated rule:

```ts
expect(originalRead).toBe("allow")
expect(originalEdit).toBe("allow")

expect(afterRead).toBe("allow")
expect(afterEdit).toBe("allow")

expect(afterRead).toBe(originalRead)
expect(afterEdit).toBe(originalEdit)
```

This preserves the metamorphic relationship while also checking that the baseline behavior is correct.

### Evidence that the strengthened property kills the mutant

With the same mutant still applied, the OpenCode-generated property passed all 200 generated cases and 9600 assertions.

My strengthened property suite failed. R5 failed immediately, and fast-check shrank the counterexample to:

```text
["a","b"]
```

The mutant also caused the R1 property for undefined deny paths to fail because the generated `edit` allow rule was malformed.

Therefore, the OpenCode-generated property allowed a real behavioral defect to survive because it compared two equally incorrect results. Adding explicit assertions for the expected permission effects caused the same mutant to be killed.