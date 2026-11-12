import { describe, expect, test } from "bun:test"
import fc from "fast-check"
import type { FileAttachmentPart, Prompt } from "@/context/prompt"
import { navigatePromptHistory, prependHistoryEntry, type PromptHistoryStoredEntry } from "./history"

// Mix arbitrary text with empty, whitespace-only, multiline, and Unicode cases.
// Every submitted entry below has a file, so even empty text is a valid prompt.
const textArbitrary = fc.oneof(
  fc.constantFrom("", " ", "\n", "first\nsecond", "🙂 café 中文"),
  fc.string({ maxLength: 80 }),
)

// Distinct paths exercise attachment-aware deduplication. Optional, ordered file
// selections cover whole files and nested selection objects that must be copied.
const fileArbitrary = fc.record({
  path: fc
    .tuple(
      fc.constantFrom("src", "docs"),
      fc.stringMatching(/^[a-z][a-z0-9_-]{0,11}$/),
      fc.constantFrom("ts", "py", "md"),
    )
    .map((parts) => `${parts[0]}/${parts[1]}.${parts[2]}`),
  selection: fc.option(
    fc.record({ start: fc.integer({ min: 1, max: 200 }), length: fc.integer({ min: 0, max: 20 }) }).map((range) => ({
      startLine: range.start,
      startChar: 1,
      endLine: range.start + range.length,
      endChar: 2,
    })),
    { nil: undefined },
  ),
})

function historyArbitrary(minLength: number) {
  // Unique file paths keep entries distinguishable without assuming unique text.
  // Small histories make long navigation sequences cheap and counterexamples small.
  return fc
    .uniqueArray(fc.record({ text: textArbitrary, file: fileArbitrary }), {
      minLength,
      maxLength: 8,
      selector: (entry) => entry.file.path,
    })
    .map((entries) => entries.map((entry) => ({ prompt: prompt(entry.text, [entry.file]), comments: [] })))
}

function prompt(value: string, files: Pick<FileAttachmentPart, "path" | "selection">[] = []): Prompt {
  return files.reduce<Prompt>(
    (parts, file) => {
      const start = parts.reduce((length, part) => length + ("content" in part ? part.content.length : 0), 0)
      const content = `@${file.path}`
      return [...parts, { ...file, type: "file", content, start, end: start + content.length }]
    },
    [{ type: "text", content: value, start: 0, end: value.length }],
  )
}

function editor(entries: PromptHistoryStoredEntry[], draft: Prompt) {
  const state: Omit<Parameters<typeof navigatePromptHistory>[0], "direction"> = {
    entries: structuredClone(entries),
    historyIndex: -1,
    currentPrompt: structuredClone(draft),
    currentComments: [],
    savedPrompt: null,
  }
  return state
}

function move(state: ReturnType<typeof editor>, direction: "up" | "down") {
  // Apply the real helper's result as its caller does; do not recreate navigation.
  const result = navigatePromptHistory({ ...state, direction })
  state.historyIndex = result.historyIndex
  state.savedPrompt = result.savedPrompt
  if (result.handled) {
    state.currentPrompt = result.entry.prompt
    state.currentComments = result.entry.comments
  }
  return result.handled
}

// These properties cover history.ts, not DOM keyboard dispatch, cursor placement,
// or model selection. They make no claim about R4/R5 or the UI entry gate for R3.
describe("prompt-input history properties (P4 zm)", () => {
  // R1: Submitted prompts with identical text but different file attachments shall
  // remain distinct history entries; recall shall restore the corresponding file.
  // Kind: metamorphic. 
  // Keeping the file fixed deduplicates a consecutive repeat;
  // changing only the file creates a second entry with the same prompt text.
  test("R1: changing only the attachment keeps both submissions recallable", () => {
    fc.assert(
      fc.property(
        textArbitrary,
        fc.uniqueArray(fileArbitrary, { minLength: 2, maxLength: 2, selector: (file) => file.path }),
        (value, files) => {
          const first = prompt(value, [files[0]])
          const second = prompt(value, [files[1]])
          const initial = prependHistoryEntry([], first)
          expect(prependHistoryEntry(initial, structuredClone(first))).toHaveLength(1)

          const entries = prependHistoryEntry(initial, second)
          expect(entries).toHaveLength(2)
          const state = editor(entries, prompt(""))
          expect(move(state, "up")).toBe(true)
          expect(state.currentPrompt).toEqual(second)
          expect(move(state, "up")).toBe(true)
          expect(state.currentPrompt).toEqual(first)
          expect(move(state, "down")).toBe(true)
          expect(state.currentPrompt).toEqual(second)
        },
      ),
      { numRuns: 200, seed: 42 },
    )
    console.info("P4 zm R1 passed: metamorphic attachment recall (200 runs)")
  })

  // R2: Browsing history and making unsent edits shall not modify the stored
  // entry's text or attachments.
  // Kind: invariant. 
  // Mutate recalled text and nested selection data, remove the
  // file, then leave and recall the same entry. Every stored entry must survive.
  test("R2: unsent edits leave stored text and attachments unchanged", () => {
    fc.assert(
      fc.property(historyArbitrary(2), fc.nat({ max: 100 }), (entries, choice) => {
        const state = editor(entries, prompt(""))
        const original = structuredClone(entries)
        const selected = choice % entries.length
        for (let index = 0; index <= selected; index++) expect(move(state, "up")).toBe(true)
        expect(state.currentPrompt).toEqual(original[selected].prompt)

        const text = state.currentPrompt[0]
        const file = state.currentPrompt[1]
        if (text?.type !== "text" || file?.type !== "file") throw new Error("expected generated text and file")
        text.content += "\nunsent edit"
        text.end = text.content.length
        if (file.selection) {
          file.selection.startLine += 1
          file.selection.endLine += 1
        }
        state.currentPrompt.splice(1)

        expect(state.entries).toEqual(original)
        expect(move(state, "down")).toBe(true)
        expect(move(state, "up")).toBe(true)
        expect(state.currentPrompt).toEqual(original[selected].prompt)
        expect(state.entries).toEqual(original)
      }),
      { numRuns: 200, seed: 42 },
    )
    console.info("P4 zm R2 passed: invariant stored-entry preservation (200 runs)")
  })

  // R3: Leaving history past the most recent entry shall restore the text and
  // attachments present immediately before entering history.
  // Kind: round-trip. 
  // Browse at least two entries, then undo every navigation.
  test("R3: browsing history and returning restores the exact draft", () => {
    fc.assert(
      fc.property(
        historyArbitrary(2),
        textArbitrary,
        fc.uniqueArray(fileArbitrary, { minLength: 1, maxLength: 3, selector: (file) => file.path }),
        fc.nat({ max: 100 }),
        (entries, value, files, choice) => {
          // Always include draft files; vary their count and browse depth so
          // restored drafts cannot be approximated by a single fixed example.
          const draft = prompt(value, files)
          const state = editor(entries, draft)
          const depth = 2 + (choice % (entries.length - 1))
          for (let index = 0; index < depth; index++) expect(move(state, "up")).toBe(true)
          for (let index = 0; index < depth; index++) expect(move(state, "down")).toBe(true)

          expect(state.historyIndex).toBe(-1)
          expect(state.currentPrompt).toEqual(draft)
          expect(state.savedPrompt).toBeNull()
          expect(state.entries).toEqual(entries)
        },
      ),
      { numRuns: 200, seed: 42 },
    )
    console.info("P4 zm R3 passed: round-trip draft restoration (200 runs)")
  })

  // R6: Navigation shall not wrap. Up at the oldest entry leaves it unchanged;
  // Down from the newest restores the saved draft, and further Down leaves it.
  // Kind: Oracle. 
  // Model the draft and entries as a list of slots with a
  // clamped position, independently of the helper's handled/index/snapshot logic.
  test("R6: navigation agrees with a bounded list model without wrapping", () => {
    fc.assert(
      fc.property(
        historyArbitrary(0),
        fc.array(fc.constantFrom<"up" | "down">("up", "down"), { maxLength: 50 }),
        (entries, randomDirections) => {
          // Include empty/singleton histories. Every run deliberately presses
          // beyond both boundaries as well as exploring a random middle sequence.
          const draft = prompt("")
          const state = editor(entries, draft)
          const slots = [draft, ...entries.map((entry) => entry.prompt)]
          const directions = [
            "down",
            "down",
            ...Array.from({ length: entries.length + 2 }, () => "up" as const),
            ...randomDirections,
            ...Array.from({ length: entries.length + 2 }, () => "down" as const),
          ] satisfies ("up" | "down")[]
          let position = 0
          for (const direction of directions) {
            const previous = position
            position = Math.max(0, Math.min(entries.length, position + (direction === "up" ? 1 : -1)))
            expect(move(state, direction)).toBe(position !== previous)
            expect(state.historyIndex).toBe(position - 1)
            expect(state.currentPrompt).toEqual(slots[position])
            expect(state.savedPrompt).toEqual(position === 0 ? null : { prompt: draft, comments: [] })
          }
          expect(state.entries).toEqual(entries)
        },
      ),
      { numRuns: 200, seed: 42 },
    )
    console.info("P4 zm R6 passed: model/oracle history boundaries (200 runs)")
  })
})
