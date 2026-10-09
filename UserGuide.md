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