# Traceability: Samantha Lu (slu4)

**Target feature:** <feature, and the main source files it lives in>

## Requirements

| ID | Interview evidence | Requirement | Acceptance Criteria | Changed in P4? | Property (kind) | Test |
|---|---|---|---|---|---|---|
| R1 | C-4: “No. Absolutely not. Any attempts at reading should be blocked” | A path that has been specified in --deny-paths should be blocked for both read and edit permissions | An agent created with --deny-paths “solutions/**” should not be able to access any of the files in the solutions folder. Both evaluate("read", "solutions/answer.ts") and evaluate("edit", "solutions/answer.ts") should return deny | No |  Invariant | `packages/opencode/test/cli/agent.property.test.ts`, "R1: denied paths are blocked for read and edit" |
| R2 | C-7, S-7, O-6: “Order shouldn’t matter” | The order in which paths are listed for `--deny-path` and `--allow-paths` should not change what is allowed vs denied | For creation of `--deny-paths a/**, b/**, c/**” vs “c/**, a/**, b/**`, all files in folders a, b, and c, should not have read nor edit access. Evaluate should return deny for both | No | Metamorphic | packages/opencode/test/cli/agent.property.test.ts`, "R2: path order within a flag does not change decisions" |
| R3 | C-5, S-5: “Once that rule is lifted, the AI should be able to touch it” | An agent's rules survive being written to its file and read back: for any action and path, the reloaded rules give the same decision as the rules that were written | For any generated ruleset written to frontmatter and parsed back, `evaluate` returns the same effect for the same action and path before and after | Yes | Round-trip | `packages/opencode/test/cli/agent.property.test.ts`, "R3: rules written to frontmatter and parsed back decide identically" |
| R4 | S-3: "this permission has been denied by the instructor, please see them if it's a mistake" | If an action is blocked, the error message shows the rules responsible for the denial | Editing a path specified under a deny rule raises a blocked error. An appropriate error message is shown to the user | Yes |  Not property-tested in P4 | Existing example test for the blocked error in `packages/core/test/permission.test.ts` ("allows and denies from explicit rules without asking”) |
| R5 | C-9, S-6, O-5, O-8: “a slash command to see what is blocked”, “it’d be nice to have it visualized” | Given a rules, an action, and a path, `explainAccess` returns the effect and the associated rule, or `ask` when no rule matches | For any ruleset, action, and path, the effect should be the same as what is pulled from the last matching rule, or `ask` if nothing matches | Yes | Model/Oracle | `packages/opencode/test/cli/agent.property.test.ts`, "R5: explainAccess agrees with a simple last-match model" |
| R6 | S-8, S-9, O-7, O-8, C-9: “Perhaps a manual command” | Given an agent's rules and a list of paths, an instructor can get the effect/rule for each path, to check before distributing | Given that solutions/** is blocked and src/** is allowed, ‘explainAccess’ shows what is allowed vs denied | Yes | Not property-tested in P4 | None, covered by R5's explain Access |
| R7 | C-6, C-8: “a log would be helpful about what is allowed or denied. So maybe a small history of that would be helpful” | Deferred, not implemented | None | Yes | Not property-tested in P4 | None |


Properties written or suggested by opencode or another AI tool: R3, R5



## Requirement changes

| ID | Original requirement (P3) | Revised requirement | Why it changed |
|---|---|---|---|
| R3 | Removing a deny rule restores agent access (same as before rule was implemented, undo) | An agent's rules survive being written to its file and read back: for any action and path, the reloaded rules give the same decision as the rules that were written | Can't be implemented as written. "undo" and "restores access" aren't defined and it conflicts with the opencode evaluator logic. C-5 expects access to "go through" once a rule is lifted, but a path without a specified rule returns `ask` |
| R4 | If an action or path is blocked, the user should see a general message saying what was denied and that it should be reported if access is expected | If an action is blocked, the error message shows the rules responsible for the denial | The message text is UI behavior that is out of scope, and the specific wording can't be checked automatically. However, the rules responsible for the error can be checked and can fulfill the user need |
| R5 | Agent restrictions can be seen and reviewed using a slash command | Given a rule, an action, and a path, `explainAccess` returns the effect and the associated rule, or `ask` when no rule matches | Not feasible as CLI command. `agent list` reads the older V1 agent system and can't see agents created as `.md` files |
| R6 | After creating an agent with path restrictions, the user can check what files were limited or allowed | Given an agent's rules and a list of paths, an instructor can get the effect/rule for each path, to check before distributing | Not feasible for same R5 V1 reason. Depends on the file system. R6 can supply path permissions using `explainAccess`, as covered in R5 |
| R7 | A history of the rulesets can be printed using a command (to view changes in file/folder access) | Deferred, not implemented in this project |  Not feasible for timeframe. Requires history of session, which lies outside of the rule-building and evlauation scope |




## Hand Written Mutant Predictions and Results
| ID | Requirement Targeted | Change | Predicted Killer | Actual Result |
|---|---|---|---|---|
| H1 | R1 | Changed denyPaths.length > 0 to denyPaths.length > 1 | A path that has been specified in --deny-paths should be blocked for both read and edit permissions (R1) | Killed: R1 property test failed after 11 tests; Counterexample: [["src"],"read"]; Shrunk 3 time(s) |
| H2 | R2 | Swapped the two blocks that process deny paths first, then allow paths | R1 or R2 (dealing with rules being properly implemented) | Survived: all tests passed, order and final decision changes were not detected |
| H3 | R5 | Effect is fine, but function gives back wrong rule (1st instead of last) | Given a rules, an action, and a path, `explainAccess` returns the effect and the associated rule, or `ask` when no rule matches (R5) | Survived: all tests passed, no difference detected between the first rule and the last matching rule |
| H4 | R1 | Block only for reading, not editing when deny path is specified | A path that has been specified in --deny-paths should be blocked for both read and edit permissions (R1) | Killed: R1 property test failed after 1 test; Counterexample: [["src"],"edit"]; Shrunk 3 time(s) |
| H5 | R5 | Change returned effect to always be “allow” | Given a rules, an action, and a path, `explainAccess` returns the effect and the associated rule, or `ask` when no rule matches (R5) | Killed: R5 property test failed after 1 test; Counterexample: [[],"read","src/a.ts"]; Shrunk 2 time(s) |



## Stryker Comparison

Mutation Score: 62.50 (20 killed, 12 survived, no timeouts or errors)

Questions:
1. Which of your hand-written mutants did Stryker never generate? Why not?
    Stryker did not generate the H2 mutant, where the allow and deny path processes were swapped. Stryker supports block removal, but not necessarily swapping two whole blocks and keeping them intact. It only created smaller, more localized mutations that often only changed one var or one char.

2. Which Stryker survivors would you never have thought of? Are any of them bugs a real developer might plausibly write?
    Stryker created a lot more small mutations (empty strings, reomoving statements) that I didn't consider, mainly because I was focused on the big picture. These are definitely bugs that a developer could accidentally write if they are reafactoring or some code gets accidentally removed. I would not have thought of changing the allow-path to if false, which completely prevents allow rules from being processed.

3. What does each approach find that the other doesn't?
    Hand-writing mutants were a bit limited in scope because it was based on my understanding of the key functionalities of this feature, which made me miss a few of the more obscure mutants. Hand-written mutants can be useful for more requirement-specific mistakes that are larger, whereas Stryker can be used for smaller, systematic code changes. Using both, however, absolutely provides a more thorough testing as opposed to using just one or the other.