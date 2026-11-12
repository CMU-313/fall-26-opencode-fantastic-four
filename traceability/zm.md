# Traceability: Emma Ma (zm)

**Target feature:** OpenCode Web UI prompt history navigation using the Up and Down arrow keys.

**Main source files:**
- [`packages/app/src/components/prompt-input/history.ts`](../packages/app/src/components/prompt-input/history.ts): history entries, attachment-aware equality, cloning, navigation, draft restoration, and cursor-position rules.
- [`packages/app/src/components/prompt-input.tsx`](../packages/app/src/components/prompt-input.tsx): keyboard handling and restoring previous entries to the prompt editor.
- [`packages/app/src/components/prompt-input/history-store.ts`](../packages/app/src/components/prompt-input/history-store.ts): persistence.

**Existing tests:** [`packages/app/src/components/prompt-input/history.test.ts`](../packages/app/src/components/prompt-input/history.test.ts).
**Added Fast-check tests:** [`packages/app/src/components/prompt-input/history.property.test.ts`](../packages/app/src/components/prompt-input/history.property.test.ts)

## Requirements

| ID | Interview evidence | Requirement | Acceptance Criteria | Changed in P4? | Property (kind) | Test | Mutants it kills |
|---|---|---|---|---|---|---|---|
| R1 | C-8, S-9, O-8: Identical prompt text with different attached files should produce two prompt history entries, each containing its own file. | Submitted prompts with identical text but different file attachments shall remain distinct history entries. Recalling either entry shall restore its corresponding attachment. | Submit "Explain this code" with a file attached (e.g. `test.py`), then submit the same text with another file (e.g. `test2.py`). From an empty editor, Up recalls the entry with `test2.py`; another Up recalls the entry with `test.py`. Each entry contains only its own attachment. | No | Metamorphic | Line 83 of fast-check test file | H1, H4 |
| R2 | C-4, S-3, S-4, O-3, O-4: Previously submitted prompts must remain unchanged when edited without being sent. | Browsing prompt history and making unsent edits to a previously sent prompt shall not modify the stored entry's text or attachments. | Given a previously sent prompt "Explain this function" with a file attached, recall it, change its text, and remove the attachment without submitting. Leave that entry and recall it again. It contains the original text and the same file attached. | No | Invariant | Line 115 of fast-check test file | H2, H4 |
| R3 | C-5-C-6, S-5, S-7, O-5-O-6: Returning from history should restore the unfinished draft and its attachment. | When the user exits history by navigating forward past the most recent entry, the editor shall restore the text and attachments present immediately before entering history. | Given an unfinished draft "Check this error" with a file (e.g. `draft.py`) attached, enter history and browse two previous entries. Navigate forward until leaving history. The editor contains exactly "Check this error" and that file (e.g. `draft.py`), with no attachments carried over from the browsed entries. | No | Round-trip | Line 151 of fast-check test file | H3, H4 |
| R4 | C-6, S-6: The cursor should return to its previous position. O-6: The cursor should return to the last character. | When restoring an unfinished draft after history navigation, the editor shall restore the cursor position recorded immediately before entering history. | Given draft text "Check this error" with the cursor immediately after "Check", enter and exit history. The cursor returns immediately after "Check". Repeat with the cursor at the end; it returns to the end. | No | Not selected for Step 2 | No property test | None, no property test was written |
| R5 | C-7, S-8, O-7: Recalling a previously submitted prompt should retain the currently selected model rather than restore the original model. | Navigating prompt history shall not change the currently selected AI model. | Given a previously submitted prompt originally submitted using Model A, select Model B and recall that prompt. Model B remains selected. Browse additional entries and return to the draft; Model B remains selected throughout. | No | Not selected for Step 2 | No property test | None, no property test was written but H5 survived |
| R6 | C-10, S-11, O-10: Navigation should stop at history boundaries rather than cycle around. | History navigation shall not wrap around. Up at the oldest entry shall leave it unchanged. Down from the newest entry shall restore the saved draft. Further Down presses shall leave that draft unchanged. | Given two previous entries and an initially empty draft, navigate to the oldest entry and press Up twice; it remains displayed. Navigate forward through the newest entry to the empty draft and press Down again; the editor remains empty. | No | Oracle | Line 182 of fast-check test file | H4 |

Properties written or suggested by opencode or another AI tool: R1, R2, R6 (written with Codex assistance).

## Requirement changes

I kept all six requirements because each specifies observable editor or history state, can be implemented with local application state, and has concrete acceptance criteria without relying on model output or external-service timing. The interview disagreement about cursor placement is resolved by retaining R4's existing exact-position policy, which supports resuming editing where the user left off; this policy does not conflict with any of the other five requirements.

| ID | Original requirement (P3) | Revised requirement | Why it changed |
|---|---|---|---|
NIL

## Hand-written mutants

Each patch is applied to commit `796bae507df8df951d07795ab70cf7e945f9e37f` on `zm/properties`. 

| ID | Requirement targeted | Change | Predicted killer | Actual result |
|---|---|---|---|---|
| [H1](../mutants/zm/H1.patch) | R1 | `history.ts`: change the prompt-part equality loop bound from `length` to `length - 1`. An off-by-one boundary skips the final attachment, so identical text with different final files is un-duplicated. | **R1**: generated prompts have equal text and a different final file; the second submission must produce two recallable entries. R2/R3/R6 construct history directly and should pass. | **Killed by R1** (9 pass, 1 fail overall). The shrunk case has empty text and final files `src/a.ts` versus `src/a.md`: expected 2 entries, but received 1. R2/R3/R6 and all examples passed. |
| [H2](../mutants/zm/H2.patch) | R2 | `history.ts`: keep copying file parts but reuse their nested `selection` object. The outer objects look independent, but editing a recalled selection mutates the stored attachment. | **R2**: it edits generated selection coordinates before removing the recalled file and compares the stored history with its original snapshot. Cases with a selection expose the shared reference. R1/R3/R6 should pass. | **Killed by R2**, plus the existing cloning example (8 pass, 2 fail overall). With a selected file range initially on line 1, an unsent edit increments the stored range to line 2. R1/R3/R6 passed. |
| [H3](../mutants/zm/H3.patch) | R3 | `history.ts`: filter file parts out of the draft snapshot when entering history. Returning restores the text but loses draft files, as if attachments were expected to be preserved elsewhere. | **R3**: every generated draft has 1–3 files, and the round-trip must restore the entire prompt exactly. R6 uses an empty draft, so it should miss this defect; R1/R2 should also pass. | **Killed by R3** (9 pass, 1 fail overall). Even the shrunk empty-text draft with one `src/a.ts` attachment returns without its file. R1/R2/R6 and all examples passed. |
| [H4](../mutants/zm/H4.patch) | R6 | `history.ts`: change the upward boundary from `entries.length - 1` to `entries.length - 2`. Navigation stops one entry early, making the oldest entry unreachable in histories with two or more entries. | **R6**: the bounded-list oracle deliberately visits and presses beyond both endpoints. **R1** should also fail on its second Up; **R2/R3** can fail when their generated navigation reaches the prematurely blocked entry. | **Killed by R6 and also R1/R2/R3** (6 pass, 4 fail overall). A two-entry history suffices: the second Up returns unhandled instead of reaching the oldest entry. All six examples passed. |
| [H5](../mutants/zm/H5.patch) | R5 | `prompt-input.tsx`: call `props.controls.model.selection.set(undefined)` while applying a history entry. This mistakenly treats recall as a fresh composer reset and clears the explicit model override. When Model B differs from the agent/default model, recalling history changes the model. | **None; expected survivor**: the four properties import `history.ts` and never mount `PromptInput` or observe model selection. R5 explicitly has no property. The six helper examples should also pass. | **Survived** (10 pass, 0 fail overall). All four properties completed 200 cases each; none loads the changed UI component or observes model selection. This is a coverage gap, not evidence that the mutation is equivalent. |


## Stryker comparison

**Configuration:** [packages/app/stryker.zm.config.json](../packages/app/stryker.zm.config.json).

**HTML report:** [mutants/zm/mutation.html](../mutants/zm/mutation.html).

**Mutation score: 63.5%** — 127 of 200 mutants killed; 73 survived. Only the four property tests ran, with **seed 42** and **200 cases per property**.

**Which handwritten mutants did Stryker never generate? Why not?**

None of the exact H1–H5 changes appeared in this run:

| Mutant | Why it was not generated |
|---|---|
| H1, H4 | Stryker changed existing operators, such as `<` to `<=` and `-` to `+`. It did not insert H1's extra `- 1` or change H4's boundary constant from `1` to `2`. |
| H2 | It replaced cloned objects with `{}`, but did not replace the nested clone with a shared reference to the original selection. |
| H3 | It did not synthesize the new `.filter(...)` call that drops draft files. |
| H5 | The UI component containing the model reset was outside the configured mutation scope. |

**Which survivors were unexpected? Could a real developer plausibly write them?**

Two survivors exposed cases absent from the handwritten set:

- **77: ignore file-selection equality.** R1 varies file paths, so it misses the same file with different selections. Although replacing the expression with `true` looks artificial, comparing only the file path and forgetting the selection is a plausible developer mistake.
- **30: remove the history-cap `.slice(0, max)`.** The handwritten set focused on navigation boundaries rather than storage limits. Accidentally dropping this cap during a refactor is plausible, and the properties never submit enough entries to detect it.

**What does each approach find that the other does not?**

Handwritten mutants cover feature-specific mistakes that this Stryker run did not generate: sharing attachment state, losing draft files, resetting the model, and the exact off-by-one boundaries in H1/H4. Stryker explores many more operator and branch variations, revealing untested selection comparisons and capacity behavior. Some survivors are also equivalent changes: mutant 67 removes a redundant file-type check already guaranteed by an earlier guard.
