import { base64Encode } from "@opencode-ai/core/util/encode"
import { expect, test, type Page } from "@playwright/test"
import {
  assistantMessage,
  setupTimeline,
  textPart,
  userMessage,
  userText,
  type PartSeed,
} from "../performance/timeline-stability/fixture"
import { mockOpenCodeServer } from "../utils/mock-server"
import { expectSessionTitle } from "../utils/waits"

const directory = "C:/OpenCode/SelectedCodeExplanation"
const projectID = "proj_selected_code_explanation"
const sessionID = "ses_selected_code_explanation"
const title = "Selected code explanation"
const server = `http://${process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1"}:${process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"}`
const levels = ["Beginner", "Intermediate", "Advanced"] as const

test.use({ viewport: { width: 1440, height: 900 } })

for (const level of levels) {
  test(`selects disconnected code ranges and requests a ${level} explanation without modifying files`, async ({
    page,
  }) => {
    const state = await openExplanationSession(page)
    await selectDisconnectedLines(page)

    const composer = page.locator('[data-component="prompt-input-v2"]')
    await composer.getByLabel("Explanation level").click()
    await page.getByRole("option", { name: level, exact: true }).click()
    await expect(composer.locator('[data-component="prompt-input"]')).toContainText(
      `Explain the selected code at the ${level} level.`,
    )

    await composer.getByRole("button", { name: "Send" }).click()
    await expect.poll(() => state.prompts.length).toBe(1)

    const parts = state.prompts[0]!.parts
    const text = parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join(" ")
    const files = parts.flatMap((part) => (part.type === "file" ? [part.url] : []))
    expect(text).toContain(`Explanation level: ${level.toLowerCase()}`)
    expect(text).toContain("Do not edit or propose edits to the selected file.")
    expect(files).toEqual([
      "file:///C:/OpenCode/SelectedCodeExplanation/Sample.swift?start=1&end=1",
      "file:///C:/OpenCode/SelectedCodeExplanation/Sample.swift?start=3&end=3",
    ])
    expect(state.fileWrites).toEqual([])
  })
}

test("shows a clear error when an explanation is requested without selected code", async ({ page }) => {
  await openExplanationSession(page)
  await page.keyboard.press("Control+k")
  const search = page.getByPlaceholder("Search files, commands, and sessions")
  await expect(search).toBeFocused()
  await search.fill("Explain selected code")
  await page.getByRole("option", { name: /Explain selected code/ }).click()

  await expect(page.getByText("No line selection", { exact: true })).toBeVisible()
  await expect(page.getByText("Select a line range in a file tab first.", { exact: true })).toBeVisible()
})

test("restores the explanation request and selected ranges after a provider failure", async ({ page }) => {
  const state = await openExplanationSession(page, true)
  await selectDisconnectedLines(page)
  const composer = page.locator('[data-component="prompt-input-v2"]')
  await composer.getByLabel("Explanation level").click()
  await page.getByRole("option", { name: "Intermediate", exact: true }).click()
  await composer.getByRole("button", { name: "Send" }).click()

  await expect.poll(() => state.prompts.length).toBe(1)
  await expect(page.getByText("Failed to send prompt", { exact: true })).toBeVisible()
  await expect(composer.locator('[data-component="prompt-input"]')).toContainText(
    "Explain the selected code at the Intermediate level.",
  )
  await expect(composer.getByText("Sample.swift:1", { exact: true })).toBeVisible()
  await expect(composer.getByText("Sample.swift:3", { exact: true })).toBeVisible()
})

test("regenerates a completed explanation at another depth with its original disconnected ranges", async ({ page }) => {
  const files = [
    selectedFile("prt_selected_first", 19, 21),
    selectedFile("prt_selected_second", 44, 46),
  ]
  const user = userMessage(
    [userText("Explain the selected code at the Beginner level.", { id: "prt_explanation_request" }), ...files],
    { id: "msg_explanation_user" },
  )
  const assistant = assistantMessage([textPart("prt_explanation_response", "Explanation level: beginner")], {
    id: "msg_explanation_assistant",
    parentID: "msg_explanation_user",
  })
  await setupTimeline(page, { messages: [user, assistant], settings: { newLayoutDesigns: true } })

  await page.getByRole("button", { name: "Regenerate explanation" }).click()
  await page.getByRole("menuitem", { name: "Advanced", exact: true }).click()

  const composer = page.locator('[data-component="prompt-input-v2"]')
  await expect(composer.locator('[data-component="prompt-input"]')).toContainText(
    "Explain the selected code at the Advanced level.",
  )
  await expect(composer.getByText("ImageLoader.swift:19-21", { exact: true })).toBeVisible()
  await expect(composer.getByText("ImageLoader.swift:44-46", { exact: true })).toBeVisible()
})

function selectedFile(id: string, start: number, end: number): PartSeed<"user"> {
  return {
    id,
    type: "file",
    mime: "text/plain",
    filename: "ImageLoader.swift",
    url: `file:///repo/ImageLoader.swift?start=${start}&end=${end}`,
  }
}

async function selectDisconnectedLines(page: Page) {
  const panel = page.locator("#review-panel")
  await panel.locator('[data-column-number="1"]').click()
  const editor = panel.locator('[data-component="line-comment-v2"][data-variant="editor"]')
  await editor.getByRole("button", { name: "More selected code actions" }).click()
  await page.getByRole("menuitem", { name: "Add selection to context" }).click()

  await panel.locator('[data-column-number="3"]').click()
  await editor.getByRole("button", { name: "Explain selected code" }).click()

  const composer = page.locator('[data-component="prompt-input-v2"]')
  await expect(composer.getByText("Sample.swift:1", { exact: true })).toBeVisible()
  await expect(composer.getByText("Sample.swift:3", { exact: true })).toBeVisible()
}

async function openExplanationSession(page: Page, failPrompt = false) {
  const prompts: Array<{ parts: Array<{ type: string; text?: string; url?: string }> }> = []
  const fileWrites: string[] = []
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname
    if (request.method() !== "GET" && path.includes("/file")) fileWrites.push(`${request.method()} ${path}`)
  })
  await mockOpenCodeServer(page, {
    directory,
    project: {
      id: projectID,
      worktree: directory,
      vcs: "git",
      name: "selected-code-explanation",
      time: { created: 1700000000000, updated: 1700000000000 },
      sandboxes: [],
    },
    provider: {
      all: [
        {
          id: "opencode",
          name: "OpenCode",
          models: { test: { id: "test", name: "Test", limit: { context: 200_000 } } },
        },
      ],
      connected: ["opencode"],
      default: { providerID: "opencode", modelID: "test" },
    },
    sessions: [
      {
        id: sessionID,
        slug: sessionID,
        projectID,
        directory,
        title,
        version: "dev",
        time: { created: 1700000000000, updated: 1700000000000 },
      },
    ],
    vcsDiff: [],
    fileList: (path) =>
      path
        ? []
        : [{ name: "Sample.swift", path: "Sample.swift", absolute: `${directory}/Sample.swift`, type: "file", ignored: false }],
    fileContent: () => ({
      type: "text",
      content: "let cached = cache[url]\nlet active = inFlight[url]\nreturn cached ?? await active?.value",
    }),
    pageMessages: () => ({ items: [] }),
  })
  await page.route("**/session/*/prompt_async", async (route) => {
    prompts.push(route.request().postDataJSON())
    if (failPrompt) {
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "failed" }) })
      return
    }
    await route.fulfill({ status: 204 })
  })
  await page.addInitScript(
    ({ directory, server, sessionID }) => {
      localStorage.setItem("settings.v3", JSON.stringify({ general: { newLayoutDesigns: true } }))
      localStorage.setItem(
        "opencode.global.dat:server",
        JSON.stringify({
          projects: { local: [{ worktree: directory, expanded: true }] },
          lastProject: { local: directory },
        }),
      )
      localStorage.setItem(
        "opencode.global.dat:layout",
        JSON.stringify({ review: { diffStyle: "split", panelOpened: true } }),
      )
      localStorage.setItem(
        "opencode.global.dat:review-panel-v2",
        JSON.stringify({ sidebarOpened: false, sidebarWidth: 240, expandMode: "collapse" }),
      )
      localStorage.setItem(
        "opencode.window.browser.dat:tabs",
        JSON.stringify([{ type: "session", server, sessionId: sessionID }]),
      )
    },
    { directory, server, sessionID },
  )

  await page.goto(`/server/${base64Encode(server)}/session/${sessionID}`)
  await expectSessionTitle(page, title)
  const panel = page.locator("#review-panel")
  await panel.getByRole("button", { name: "Open file" }).click()
  await panel.getByRole("button", { name: "Sample.swift" }).click()
  await expect(panel.getByText("let cached = cache[url]", { exact: true })).toBeVisible()
  return { prompts, fileWrites }
}
