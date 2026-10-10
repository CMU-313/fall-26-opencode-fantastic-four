# Learning walkthrough user guide

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
