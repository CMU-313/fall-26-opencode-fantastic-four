# Traceability: Emma Ma (zm)

**Target feature:** OpenCode Web UI prompt history navigation using the Up and Down arrow keys.

**Main source files:**
- [`packages/app/src/components/prompt-input/history.ts`](../packages/app/src/components/prompt-input/history.ts): history entries, attachment-aware equality, cloning, navigation, draft restoration, and cursor-position rules.
- [`packages/app/src/components/prompt-input.tsx`](../packages/app/src/components/prompt-input.tsx): keyboard handling and applying recalled entries to the prompt editor.
- [`packages/app/src/components/prompt-input/history-store.ts`](../packages/app/src/components/prompt-input/history-store.ts): separate normal and shell prompt histories and persistence.

**Existing tests:** [`packages/app/src/components/prompt-input/history.test.ts`](../packages/app/src/components/prompt-input/history.test.ts).

## Requirements

| ID | Interview evidence | Requirement | Acceptance Criteria | Changed in P4? | Property (kind) | Test |
|---|---|---|---|---|---|---|
| R1 | C-8, S-9, O-8: Identical prompt text with different attached files should produce two prompt history entries, each containing its own file. | Submitted prompts with identical text but different file attachments shall remain distinct history entries. Recalling either entry shall restore its corresponding attachment. | Submit "Explain this code" with a file attached (e.g. `test.py`), then submit the same text with another file (e.g. `test2.py`). From an empty editor, Up recalls the entry with `test2.py`; another Up recalls the entry with `test.py`. Each entry contains only its own attachment. | No | Pending Step 2 | Pending Step 2 |
| R2 | C-4, S-3, S-4, O-3, O-4: Previously submitted prompts must remain unchanged when edited without being sent. | Browsing prompt history and making unsent edits to a previously sent prompt shall not modify the stored entry's text or attachments. | Given a previously sent prompt "Explain this function" with a file attached, recall it, change its text, and remove the attachment without submitting. Leave that entry and recall it again. It contains the original text and the same file attached. | No | Pending Step 2 | Pending Step 2 |
| R3 | C-5-C-6, S-5, S-7, O-5-O-6: Returning from history should restore the unfinished draft and its attachment. | When the user exits history by navigating forward past the most recent entry, the editor shall restore the text and attachments present immediately before entering history. | Given an unfinished draft "Check this error" with a file (e.g. `draft.py`) attached, enter history and browse two previous entries. Navigate forward until leaving history. The editor contains exactly "Check this error" and that file (e.g. `draft.py`), with no attachments carried over from the browsed entries. | No | Pending Step 2 | Pending Step 2 |
| R4 | C-6, S-6: The cursor should return to its previous position. O-6: The cursor should return to the last character. | When restoring an unfinished draft after history navigation, the editor shall restore the cursor position recorded immediately before entering history. | Given draft text "Check this error" with the cursor immediately after "Check", enter and exit history. The cursor returns immediately after "Check". Repeat with the cursor at the end; it returns to the end. | No | Pending Step 2 | Pending Step 2 |
| R5 | C-7, S-8, O-7: Recalling a previously submitted prompt should retain the currently selected model rather than restore the original model. | Navigating prompt history shall not change the currently selected AI model. | Given a previously submitted prompt originally submitted using Model A, select Model B and recall that prompt. Model B remains selected. Browse additional entries and return to the draft; Model B remains selected throughout. | No | Pending Step 2 | Pending Step 2 |
| R6 | C-10, S-11, O-10: Navigation should stop at history boundaries rather than cycle around. | History navigation shall not wrap around. Up at the oldest entry shall leave it unchanged. Down from the newest entry shall restore the saved draft. Further Down presses shall leave that draft unchanged. | Given two previous entries and an initially empty draft, navigate to the oldest entry and press Up twice; it remains displayed. Navigate forward through the newest entry to the empty draft and press Down again; the editor remains empty. | No | Pending Step 2 | Pending Step 2 |

Properties written or suggested by opencode or another AI tool: none yet (Step 2 has not started).

## Requirement changes

I kept all six requirements because each specifies observable editor or history state, can be implemented with local application state, and has concrete acceptance criteria without relying on model output or external-service timing. The interview disagreement about cursor placement is resolved by retaining R4's existing exact-position policy, which supports resuming editing where the user left off; this policy does not conflict with any of the other five requirements.

| ID | Original requirement (P3) | Revised requirement | Why it changed |
|---|---|---|---|
NIL
