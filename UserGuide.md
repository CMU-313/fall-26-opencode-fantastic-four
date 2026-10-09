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

## Feature: Explain Selected Code (Adjustable Depth & Multi-Selection)
**Contributor:** Emma Ma / @horsepaperfish

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
