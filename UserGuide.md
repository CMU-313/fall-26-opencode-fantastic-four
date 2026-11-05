# Restrict AI File Access
## Samantha Lu (andrewid slu4 / github slu8)

**User Story:** As an instructor, I want to specify which files AI can access for an assignment, so that I can control the scope of AI assistance while preserving the learning objectives of the assignment.

**Overview:** Instructors can restrict which files a created AI agent is able to read or edit. This includes specific files, as well as whole folders. This allows students to receive AI help on only part of the codebase, in order to prevent AI from touching unrelated parts of the project and to discourage overreliance on AI.



### How to Use

**Option 1 (Flags)**
In the terminal, start with the standard `opencode agent create` and type out the `--description`, `--mode`, and `--permissions`. Then add `--allow-paths "..."` and `--deny-paths "..."` flags as needed to restrict files for read and edit permissions. 

Any paths not specified in the flags falls back on OpenCode's default behavior (AI prompt for permission before accessing), as opposed to automatic denial or approval. 

Example: 
```
opencode agent create \
  --description "Assignment helper: can edit src/, not solutions/" \
  --mode primary \
  --permissions read,edit \
  --allow-paths "src/**" \
  --deny-paths "solutions/**"
```


**Option 2 (No Flags)**
By only entering `opencode agent create` without flags in the terminal, you will automatically be prompted to walk through filling out each field. It will start with description, permissions (toggle to select/unselect), mode, and then paths to allow and paths to deny. Leave blank for no restrictions or type in comma-separated globs



### Viewing Set Permissions and Distributing
Both methods of using or leaving out flags write a new `.md` to `.opencode/agents/<name>.md` in the project. This contains details of the agent that has been created and will list all set permissions. This file can be committed to the assignment repo or sent out as a template so that students can automatically get the restrictions in OpenCode. It requires no setup on their end.



### Automated Tests
Tests are located in `packages/opencode/test/cli/agent.test.ts` and cover the following:
- **`buildPermissions`:** creates deny rules for fully-selected, fully-unselected, and partially-selected cases
- **`buildPathPermissions`:** creates path-scoped allow/deny rules; ordered so that deny rules come before allow rules (permission evaluator uses last-match wins, so need to ensure correct build order of permissions) 
- **Integration Test for `buildPermissions` and `buildPathPermissions`:** combines the two path-building functions and runs it through OpenCode's V2 evaluate() to confirm correct blocking; ensures that ordering of permissions is correct so that specific allow paths override a broader deny
- **`parsePathInput`:** parsing logic for flag and no-flag/prompt path specification; handles comma-splitting, whitespaces, and empty input

**Justification:** The above tests cover criteria from the associated issues and user story. This includes correct/updated permission shape, correct path rule reading and generation, correct ordering of rules, integration testing, and end-to-end testing.

# Progressive debugging hints
## Jake Pajerski (andrewid jakepaje/ github JakePJakeP)

The debugging-hint commands let a student ask for help without immediately receiving a complete solution. They are opt-in: normal OpenCode prompts continue to behave normally.

### Use the feature

1. Start OpenCode and describe the problem with `/debug-hint <problem>`.
2. OpenCode responds with `Hint 1 — Conceptual`, which identifies the relevant concept or class of defect.
3. If more help is needed, run `/debug-hint <problem>` again in the same conversation. The response advances to `Hint 2 — Targeted`, which points to a narrow code area or diagnostic experiment.
4. Run the command a third time for `Hint 3 — Specific`, which explains the faulty behavior and the requirement a correction must satisfy without supplying that correction.
5. At any point, run `/debug-solution <problem>` to explicitly request the root cause and a complete, actionable correction.

Keep related hint requests in the same conversation because OpenCode uses the earlier messages to choose the next level and avoid repeating information. If the initial problem lacks essential context, OpenCode asks a focused diagnostic question; that question does not consume a hint level.

Example:

```text
/debug-hint My loop returns the wrong total for an empty input array
/debug-hint My loop returns the wrong total for an empty input array
/debug-solution My loop returns the wrong total for an empty input array
```

### User-test the feature

Use a small reproducible bug and check the following behavior in one conversation:

- The first three `/debug-hint` responses are labeled Conceptual, Targeted, and Specific in order.
- Each later hint adds information rather than repeating the earlier hint.
- None of the hint responses contains corrected code, exact replacement text, a patch, or file edits.
- A fourth hint request offers `/debug-solution` instead of inventing another level.
- `/debug-solution` provides a complete correction only after the student explicitly requests it.
- A normal prompt outside these commands is not restricted to hint-only behavior.

Model output can vary, so manual user testing checks the response behavior. The automated contract tests are in `packages/opencode/test/command/debugging.test.ts`. They verify the three-level progression instructions, conversation-aware level selection, non-repetition rule, solution boundary, missing-context behavior, explicit solution escape hatch, command names, and argument forwarding. Together, these tests cover the deterministic command contract while the manual steps cover the model's observable response to that contract.


# Feature: Explain Selected Code (Adjustable Depth & Multi-Selection)
## Emma Ma (andrewid zm/ github horsepaperfish)

Because students have varying levels of familiarity with a codebase, not everyone requires the same depth of detail when asking AI to explain code. This feature introduces an "Explain Selected Code" workflow in OpenCode's Web UI with adjustable Beginner, Intermediate, and Advanced explanation levels, non-contiguous line selection support, and session-isolated depth settings.

---

### 1. User Guide: How to Use

#### Launching the OpenCode Web UI
If dependencies are missing, first run `bun install` from the repository root:
```bash
cd ~/Documents/fall-26-opencode-fantastic-four
bun install
```

Next, launch the backend and frontend in two separate terminal windows:

**Terminal 1 (Backend):**
```bash
cd ~/Documents/fall-26-opencode-fantastic-four/packages/opencode
bun run --conditions=browser ./src/index.ts serve --port 4096
```

**Terminal 2 (Web App):**
```bash
cd ~/Documents/fall-26-opencode-fantastic-four/packages/app
bun dev -- --port 4444
```

Once both servers are running, open **http://localhost:4444** in your browser.

#### Using the Feature
1. Open a project and start a session in the Web UI.
2. Open a code file and select lines using the line numbers in the editor margin.
3. For disconnected (non-contiguous) ranges, select your first line range and click **“Add selection to context”**. Repeat this for each additional range you wish to include.
4. In the prompt composer, choose your desired level depth: **Beginner**, **Intermediate**, or **Advanced**.
5. Click **“Explain selected code.”** OpenCode attaches the selected file and line ranges, sending instructions to explain the code at your active depth level without refactoring or editing it.
6. If you want a different level of detail after receiving the output, switch the level dropdown and click **“Regenerate explanation.”**

### 2. Manual Testing Guide (QA Steps)

1. **Depth Selection & Regeneration Test:** Open a project and session, open a code file, and select a block of lines using the line numbers. Select **Beginner** and click **“Explain selected code.”** Verify the output focuses on fundamental syntax and step-by-step concepts. Change the level selector to **Advanced** and click **“Regenerate explanation”** to confirm the response shifts focus to architectural considerations and performance without attempting code edits.
2. **Disconnected Ranges Test:** Highlight a line range using line numbers, click **“Add selection to context”**, highlight a separate range, and click **“Add selection to context”** again. Run **“Explain selected code”** to verify both ranges appear in context and are explained together.

### 3. Automated Tests & Coverage Rationale

**Test Locations:**  
Automated tests for this feature are located in `[src/services/prompt/__tests__/buildRequestParts.test.ts]`, `[src/components/composer/__tests__/ExplanationLevelSelector.test.tsx]`, `[src/utils/__tests__/codeSelectionUtils.test.ts]`, and `[src/i18n/__tests__/translationFallback.test.ts]`.

**What is Tested:**  
The test suite verifies that `buildRequestParts()` correctly attaches instructions matching the active explanation level. Further component tests also validate that the level selector renders correctly across screen layouts, maintains an isolated session state, and falls back to English when translation keys are missing (accessibility feature!). Utility unit tests verify multi-range line selection, and edge-case testing for out-of-bounds, modified, or excessively large or small line selections.

**Why These Tests Are Sufficient:**  
These tests provide comprehensive coverage across UI components, session state, and utility functions. By explicitly testing that prompt generation cannot inject code-modification instructions, verifying that session states remain strictly isolated, and covering edge cases like stale line numbers and truncated buffers, the automated test suite shows a high system stability and response accuracy for students who want to use this feature.



# Learning walkthrough user guide

## Andy Xiong (andrewid andyxion / github plopopo)

## Setup and use

The learning walkthrough explains code changes made during an OpenCode session. It is available in the app when connected to a V2 server and an existing session is open. Configure a working model/provider and use a Git project with session snapshots enabled so completed changes can be explained.

For local development, install dependencies with `bun install` from the repository root. Start the backend and app in separate terminals, also from the root:

```sh
bun dev serve --port 4096
```

```sh
bun run dev:web
```

Open the app at the URL printed by Vite and connect to the local backend at `http://localhost:4096`. Open your project, select a model, and start a session.

1. Ask OpenCode to make a small code change and wait for the assistant to finish.
2. Open the command palette with Ctrl+K (Cmd+K on macOS), search for **Learning walkthrough**, and select it. You can also select it from the composer's **Add images and files → Commands** menu or the `/walkthrough` command suggestion.
3. The dialog shows **Preparing your learning walkthrough…** while generating explanations.
4. Read each file's **What changed**, **Why it changed**, and **Programming concepts** sections.
5. Close the dialog to continue working. An existing composer draft is preserved.

Generation only starts when you select the command. Each request uses the session's selected model and existing snapshots, so explanations can vary and use provider tokens. It explains the net changes across completed assistant snapshots, restricted to paths recorded by those turns; unfinished turns and changes excluded by a session revert are omitted. Files whose changes cancel out have no entry. Reasons use session context; unclear intent should be described as inferred or unknown. A file may have no applicable programming concepts.

## Manual testing

Use a disposable Git project and a configured provider for these checks. Compare explanations with the actual session diff rather than expecting identical model wording.

| Check                  | Steps                                                                                                                                                     | Expected result                                                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Successful walkthrough | Ask the assistant to change a greeting function to trim its name argument. Wait for completion, then select Learning walkthrough.                         | Loading appears, followed by the changed file, a description of trimming, a reason tied to your request, and relevant concepts. |
| Multiple files         | Ask for changes to two files, including adding or deleting a file, and open the walkthrough after completion.                                             | Each file with a recorded net change gets an entry; additions and deletions are described accurately.                           |
| Explicit request       | Open a session and type a draft without selecting the walkthrough. Optionally watch the browser Network panel for `/api/session/<sessionID>/walkthrough`. | No walkthrough request occurs until the command is selected. Selecting it sends a POST for the active session.                  |
| Draft preservation     | Type `Keep this draft`, invoke the command through the palette or Commands menu, and close the dialog.                                                    | The draft remains and can still be edited or submitted.                                                                         |
| Empty session          | Open an existing session with no completed file changes and select the command.                                                                           | The dialog says **No completed changes to explain.**                                                                            |
| Reverted changes       | Complete two changes, use session undo to revert the later turn, then request the walkthrough again.                                                      | The reverted turn's changes and later prompt context are excluded. Reverting to the first prompt leaves no changes to explain.  |
| Failure and retry      | In browser developer tools, temporarily block the walkthrough endpoint, then invoke the command. Remove the block and click **Try again**.                | The dialog shows an error and retry button; retry generates the walkthrough when the request can succeed.                       |
| Session switch         | Start generation and switch sessions before it finishes.                                                                                                  | The old walkthrough dialog closes; its result is not shown in the new session.                                                  |
| Availability           | Check the command with no existing session selected or with a legacy server connection.                                                                   | The command is unavailable until an existing V2 session is selected.                                                            |

## Automated tests

These tests live in the repository:

| File                                                                                                               | Coverage                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [packages/core/test/session-walkthrough.test.ts](packages/core/test/session-walkthrough.test.ts)                   | Entry schema validation; diff and context in prompts; explicit truncation of large inputs; one structured explanation per file; empty diffs; missing reasons; provider errors.                                                |
| [packages/core/test/session-walkthrough-snapshot.test.ts](packages/core/test/session-walkthrough-snapshot.test.ts) | Actual Git snapshots for added/deleted files; exclusion of paths absent from the session's recorded file list; net-empty changes; sessions without completed snapshots.                                                       |
| [packages/server/test/session-walkthrough.test.ts](packages/server/test/session-walkthrough.test.ts)               | Explicit requests using chronological session history and the session model; revert boundaries; unrelated-path filtering; empty and missing sessions; model resolution failures.                                              |
| [packages/server/test/cors.test.ts](packages/server/test/cors.test.ts)                                             | Browser preflight for the walkthrough POST endpoint, plus shared CORS/authentication behavior.                                                                                                                                |
| [packages/app/src/utils/server.test.ts](packages/app/src/utils/server.test.ts)                                     | No request at client creation; explicit authenticated POST to the selected session; response decoding and cancellation signal forwarding.                                                                                     |
| [packages/app/e2e/regression/session-walkthrough.spec.ts](packages/app/e2e/regression/session-walkthrough.spec.ts) | Browser success, empty result, and failure/retry flows; generation only on selection; correct session URL; preserved and editable draft after closing. Uses mocked server responses, so it does not verify live model output. |

Run focused tests from their package directories, never from the repository root:

```sh
cd packages/core
bun test test/session-walkthrough.test.ts test/session-walkthrough-snapshot.test.ts
```

```sh
cd packages/server
bun test test/session-walkthrough.test.ts test/cors.test.ts
```

```sh
cd packages/app
bun test --conditions=solid --preload ./happydom.ts ./src/utils/server.test.ts
bunx playwright install chromium
bun run test:e2e:local -- e2e/regression/session-walkthrough.spec.ts
```

For browser test setup and backend/port options, see [packages/app/README.md](packages/app/README.md#e2e-testing). The session-switch and command-availability checks above remain manual checks; the focused browser tests cover success, empty results, retry, and draft preservation.

