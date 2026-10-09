import { expect, test } from "@playwright/test"
import { base64Encode } from "@opencode-ai/core/util/encode"
import { mockOpenCodeServer } from "../utils/mock-server"
import { expectAppVisible } from "../utils/waits"

const directory = "/project/walkthrough"
const sessionID = "ses_learning_walkthrough"

for (const outcome of ["success", "multiple", "empty", "retry"] as const) {
  test(`learning walkthrough is opt-in and preserves the draft: ${outcome}`, async ({ page }) => {
    const requests: string[] = []
    await mockOpenCodeServer(page, {
      protocol: "v2",
      directory,
      project: {
        id: "proj_learning",
        worktree: directory,
        vcs: "git",
        name: "Learning",
        time: { created: 1, updated: 1 },
        sandboxes: [],
      },
      provider: { all: [], connected: [], default: {} },
      sessions: [
        {
          id: sessionID,
          slug: "learning",
          projectID: "proj_learning",
          directory,
          title: "Learning session",
          version: "dev",
          time: { created: 1, updated: 1 },
        },
      ],
      pageMessages: () => ({ items: [] }),
    })
    await page.route("**/api/session/*/walkthrough", async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({
          status: 204,
          headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "POST" },
        })
        return
      }
      requests.push(route.request().url())
      const dialog = page.getByRole("dialog", { name: "Learning walkthrough" })
      await expect(dialog.getByRole("status")).toHaveText("Preparing your learning walkthrough…")
      await expect(dialog.locator('[aria-busy="true"]')).toBeVisible()
      await route.fulfill({
        status: outcome === "retry" && requests.length === 1 ? 503 : 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({
          data:
            outcome === "empty"
              ? []
              : [
                  {
                    file: "src/greet.ts",
                    whatChanged: "Trims whitespace from names.",
                    whyChanged: "The student requested consistent greetings.",
                    concepts: ["String normalization"],
                  },
                  ...(outcome === "multiple"
                    ? [
                        {
                          file: "docs/greeting.md",
                          whatChanged: "Documents trimmed names in the greeting example.",
                          whyChanged: "Keeps the example consistent with the implementation.",
                          concepts: [],
                        },
                      ]
                    : []),
                ],
        }),
      })
    })
    await page.addInitScript(() =>
      localStorage.setItem("settings.v3", JSON.stringify({ general: { newLayoutDesigns: true } })),
    )
    await page.goto(`/${base64Encode(directory)}/session/${sessionID}`)
    const composer = page.locator('[data-component="prompt-input-v2"]')
    const input = composer.locator('[data-component="prompt-input"]')
    await expectAppVisible(composer)
    await input.fill("Keep this draft")
    await composer.getByRole("button", { name: "Add images and files" }).click()
    await page.getByRole("menuitem", { name: "Commands" }).click()
    const action = page.locator('[data-suggestion-id="session.walkthrough"]')
    await expect(action).toBeVisible()
    expect(requests).toHaveLength(0)
    await action.click()
    const dialog = page.getByRole("dialog", { name: "Learning walkthrough" })
    if (outcome === "retry") {
      await expect(dialog.getByRole("alert")).toContainText("could not be generated")
      await dialog.getByRole("button", { name: "Try again" }).click()
    }
    if (outcome === "empty") await expect(dialog).toContainText("No completed changes to explain.")
    if (outcome !== "empty") {
      const file = dialog.getByRole("article", { name: "src/greet.ts", exact: true })
      await expect(file.getByRole("heading", { name: "src/greet.ts" })).toBeVisible()
      await expect(file).toContainText("What changed")
      await expect(file).toContainText("Trims whitespace from names.")
      await expect(file).toContainText("Why it changed")
      await expect(file).toContainText("The student requested consistent greetings.")
      await expect(file).toContainText("Programming concepts")
      await expect(file.getByRole("listitem")).toHaveText(["String normalization"])
    }
    if (outcome === "multiple") {
      await expect(dialog.getByRole("article")).toHaveCount(2)
      const file = dialog.getByRole("article", { name: "docs/greeting.md", exact: true })
      await expect(file.getByRole("heading", { name: "docs/greeting.md" })).toBeVisible()
      await expect(file).toContainText("Documents trimmed names in the greeting example.")
      await expect(file).toContainText("Keeps the example consistent with the implementation.")
      await expect(file).toContainText("No programming concepts identified for this change.")
      await expect(file.getByRole("list")).toHaveCount(0)
    }
    await expect(dialog.locator('[aria-busy="false"]')).toBeVisible()
    expect(requests).toHaveLength(outcome === "retry" ? 2 : 1)
    expect(requests.every((url) => new URL(url).pathname === `/api/session/${sessionID}/walkthrough`)).toBe(true)
    await dialog.getByRole("button", { name: "Close", exact: true }).click()
    await expect(input).toHaveText("Keep this draft")
    await input.fill("Continue working")
    await expect(input).toHaveText("Continue working")
    expect(requests).toHaveLength(outcome === "retry" ? 2 : 1)
  })
}
