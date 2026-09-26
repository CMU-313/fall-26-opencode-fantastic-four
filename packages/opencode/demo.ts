// Demo: instructor creates an assignment agent, student's session enforces it.
//
// Run from packages/opencode:
//   bun run /path/to/demo.ts
//
// This bypasses only the LLM-generated description step (blocked in this dev
// environment by an unrelated Console free-tier restriction). Everything else
// — permission building, frontmatter format, file location, and enforcement —
// uses the same real code the CLI command uses.

import path from "path"
import fs from "fs/promises"
import matter from "gray-matter"
import { buildPermissions, buildPathPermissions } from "./src/cli/cmd/agent"
import { PermissionV2 } from "@opencode-ai/core/permission"

const PROJECT_DIR = "/tmp/assignment-demo"

async function main() {
  console.log("=== Step 1: Instructor creates a restricted assignment agent ===\n")

  const selected = ["read", "edit"] // instructor's --permissions choice
  const allowPaths = ["src/**"] // instructor's --allow-paths choice
  const denyPaths = ["solutions/**"] // instructor's --deny-paths choice

  const permissions = buildPermissions(selected)
  const pathPermissions = buildPathPermissions(allowPaths, denyPaths)
  const allPermissions = [
    ...permissions,
    ...pathPermissions.filter((r) => r.effect === "deny"),
    ...pathPermissions.filter((r) => r.effect === "allow"),
  ]

  const frontmatter = {
    description: "Assignment helper: can edit src/, cannot touch solutions/",
    mode: "primary" as const,
    permissions: allPermissions,
  }

  const content = matter.stringify(
    "You are a helpful assignment assistant. Help the student write code in src/ without giving away the solution.",
    frontmatter,
  )

  const agentsDir = path.join(PROJECT_DIR, ".opencode", "agents")
  await fs.mkdir(agentsDir, { recursive: true })
  const filePath = path.join(agentsDir, "assignment-helper.md")
  await fs.writeFile(filePath, content)

  console.log(`Wrote agent config to: ${filePath}\n`)
  console.log("--- File contents ---")
  console.log(content)
  console.log("--- end file ---\n")

  console.log("=== Step 2: Student clones the project, opens it in OpenCode ===")
  console.log("(The .opencode/agents/assignment-helper.md file above travels with the")
  console.log(" project automatically — via git, zip, or GitHub Classroom template.)\n")

  console.log("=== Step 3: Student's session enforces the instructor's restrictions ===\n")

  const checks: Array<{ action: string; resource: string; label: string }> = [
    { action: "edit", resource: "src/main.ts", label: "Edit src/main.ts" },
    { action: "edit", resource: "solutions/answer.ts", label: "Edit solutions/answer.ts" },
    { action: "read", resource: "solutions/answer.ts", label: "Read solutions/answer.ts" },
    { action: "bash", resource: "anything", label: "Run a bash command" },
  ]

  for (const check of checks) {
    const result = PermissionV2.evaluate(check.action, check.resource, allPermissions)
    console.log(`${check.label.padEnd(28)} -> ${result.effect}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})