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