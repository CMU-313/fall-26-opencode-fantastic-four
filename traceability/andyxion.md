# Traceability: Andy Xiong (andyxion)

**Target feature:** Path-based allow/deny permissions for OpenCode agents.

Main source files:
- `packages/opencode/src/cli/cmd/agent.ts`
- `packages/core/src/permission.ts`

## Requirements

| ID | Interview evidence | Requirement | Acceptance Criteria | Changed in P4? | Property (kind) | Test |
|---|---|---|---|---|---|---|
| R1 | C-2, S-2, O-2 | A matching deny rule for a read or edit operation must resolve to `deny` when no later matching rule overrides it. | Given a deny rule for a generated path, both `read` and `edit` on a matching file evaluate to `deny`. | Yes | Matching deny rules remain denied (invariant) | `packages/opencode/test/cli/agent.property.test.ts` — `R1: matching deny rules remain denied` |
| R2 | C-3, S-3, O-3 | For the same resource, read and edit may resolve to different permission effects when separate rules are configured. | Given `read=allow` and `edit=deny` for the same resource, reading evaluates to `allow` while editing evaluates to `deny`. | Yes | Not property-tested in P4 | — |
| R3 | C-4, S-4, O-4 | Saving and reloading an agent must preserve its ordered rules and permission decisions. | After saving and reloading an agent, the same action/path combinations produce the same permission decisions. | No | Not property-tested in P4 | — |
| R4 | C-5, S-5, O-5 | Adding and then removing a rule must restore the original permission behavior after reload. | Add a temporary deny rule, verify that the relevant permission changes, remove the rule, reload, and verify that the original behavior returns. | No | Not property-tested in P4 | — |
| R5 | C-6, S-6, O-6 | Adding a rule that does not match a requested path must leave that request's permission decision unchanged. | For any two distinct generated folders, adding a deny rule for one folder does not change the existing permission decision for a file in the other folder. | No | Adding an unrelated rule preserves the original decision (metamorphic) | `packages/opencode/test/cli/agent.property.test.ts` — `R5: unrelated rules do not change permission decisions` |
| R6 | C-7, O-7 | Path-list input must trim surrounding whitespace and ignore blank entries without changing the order of valid paths. | For any generated list of valid path patterns, adding surrounding whitespace and blank comma-separated entries produces the same parsed path list as the clean input. | No | Whitespace and blank entries preserve parsed valid paths (metamorphic) | `packages/opencode/test/cli/agent.property.test.ts` — `R6: whitespace and blank entries do not change parsed paths` |
| R7 | C-9, O-2, S-9, O-9 | The interface must distinguish denial from approval requests and identify the action and path involved. | A denied action is not presented as an approval request, while an `ask` result waits for user approval and identifies the relevant action and path. | No | Not property-tested in P4 | — |
| R8 | S-7, S-8 | When multiple permission rules match the same action and resource, the last matching rule determines the permission effect. | For any generated ordered rule set, `PermissionV2.evaluate()` returns the same result as a reference implementation that applies matching rules in order and keeps the effect of the final match. | Yes | Evaluator agrees with a last-match-wins reference model (model/oracle) | `packages/opencode/test/cli/agent.property.test.ts` — `R8: evaluator agrees with last-match-wins reference model` |

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