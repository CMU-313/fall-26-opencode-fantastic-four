import { describe, expect, test } from "bun:test"
import fc from "fast-check"
import type { FileAttachmentPart, Prompt } from "@/context/prompt"
import {
  navigatePromptHistory,
  normalizePromptHistoryEntry,
  prependHistoryEntry,
  type PromptHistoryStoredEntry,
} from "./history"

// Mix arbitrary text with empty, whitespace-only, multiline, and Unicode cases.
// Every submitted entry below has a file, so even empty text is a valid prompt.
const textArbitrary = fc.oneof(
  fc.constantFrom("", " ", "\n", "first\nsecond", "🙂 café 中文"),
  fc.string({ maxLength: 80 }),
)

const selectionArbitrary = fc
  .record({
    start: fc.integer({ min: 1, max: 200 }),
    length: fc.integer({ min: 0, max: 20 }),
    startChar: fc.integer({ min: 0, max: 40 }),
    endChar: fc.integer({ min: 0, max: 40 }),
  })
  .map((range) => ({
    startLine: range.start,
    startChar: range.startChar,
    endLine: range.start + range.length,
    endChar: range.startChar + range.endChar,
  }))

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
  selection: fc.option(selectionArbitrary, { nil: undefined }),
})

const mixedPromptArbitrary = fc
  .tuple(textArbitrary, fileArbitrary, fc.string({ minLength: 1, maxLength: 20 }), fc.uuid())
  .map(([value, file, name, id]): Prompt => {
    const parts = prompt(value, [file])
    const start = parts.reduce((length, part) => length + ("content" in part ? part.content.length : 0), 0)
    return [
      ...parts,
      { type: "agent", name, content: `@${name}`, start, end: start + name.length + 1 },
      { type: "image", id, filename: `${id}.png`, mime: "image/png", blob: { id, url: `blob:${id}` } },
    ]
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
    expect(result.cursor).toBe(direction === "up" ? "start" : "end")
    state.currentPrompt = result.entry.prompt
    state.currentComments = result.entry.comments
  }
  return result.handled
}

// These properties check history.ts and its cursor instructions, not DOM caret
// restoration (R4), model selection (R5), or the UI entry gate for R3.
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
          expect(state.currentPrompt).toStrictEqual(second)
          expect(move(state, "up")).toBe(true)
          expect(state.currentPrompt).toStrictEqual(first)
          expect(move(state, "down")).toBe(true)
          expect(state.currentPrompt).toStrictEqual(second)
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
        expect(state.currentPrompt).toStrictEqual(original[selected].prompt)

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

        expect(state.entries).toStrictEqual(original)
        expect(move(state, "down")).toBe(true)
        expect(move(state, "up")).toBe(true)
        expect(state.currentPrompt).toStrictEqual(original[selected].prompt)
        expect(state.entries).toStrictEqual(original)
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
          expect(state.currentPrompt).toStrictEqual(draft)
          expect(state.savedPrompt).toBeNull()
          expect(state.entries).toStrictEqual(entries)
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
            expect(state.currentPrompt).toStrictEqual(slots[position])
            expect(state.savedPrompt).toStrictEqual(position === 0 ? null : { prompt: draft, comments: [] })
          }
          expect(state.entries).toStrictEqual(entries)
        },
      ),
      { numRuns: 200, seed: 42 },
    )
    console.info("P4 zm R6 passed: model/oracle history boundaries (200 runs)")
  })

  test("R1: changing any prompt identity field prevents deduplication", () => {
    fc.assert(
      fc.property(mixedPromptArbitrary, selectionArbitrary, (generated, selection) => {
        const base = structuredClone(generated)
        const file = base[1]
        if (file.type !== "file") throw new Error("expected generated file")
        file.selection = { ...selection, endLine: Math.max(selection.endLine, selection.startLine + 2) }
        const variants: Prompt[] = []
        for (const key of ["startLine", "startChar", "endLine", "endChar"] as const) {
          const changed = structuredClone(base)
          const part = changed[1]
          if (part.type !== "file" || !part.selection) throw new Error("expected selected file")
          part.selection[key] += 1
          variants.push(changed)
        }
        const wholeFile = structuredClone(base)
        if (wholeFile[1].type !== "file") throw new Error("expected file")
        wholeFile[1].selection = undefined
        variants.push(wholeFile, base.slice(0, -1))
        const edited = structuredClone(base)
        if (edited[0].type !== "text" || edited[2].type !== "agent" || edited[3].type !== "image") {
          throw new Error("expected generated part types")
        }
        edited[0].content += " changed"
        edited[0].end = edited[0].content.length
        variants.push(structuredClone(edited))
        edited[0] = structuredClone(base[0])
        edited[2].name += " changed"
        variants.push(structuredClone(edited))
        edited[2] = structuredClone(base[2])
        edited[3].id += "-changed"
        variants.push(edited)

        expect(prependHistoryEntry(prependHistoryEntry([], base), structuredClone(base))).toHaveLength(1)
        for (const variant of variants) {
          expect(prependHistoryEntry(prependHistoryEntry([], base), variant)).toHaveLength(2)
          expect(prependHistoryEntry(prependHistoryEntry([], variant), base)).toHaveLength(2)
        }
        // Equal display text does not make different part types identical.
        const attachment = prompt("", [file]).slice(1)
        const plainText = prompt(`@${file.path}`)
        expect(prependHistoryEntry(prependHistoryEntry([], plainText), attachment)).toHaveLength(2)
        expect(prependHistoryEntry(prependHistoryEntry([], attachment), plainText)).toHaveLength(2)
        const emptyText = prompt("", [file])
        const imageFirst = [structuredClone(base[3]), structuredClone(emptyText[1])]
        expect(prependHistoryEntry(prependHistoryEntry([], emptyText), imageFirst)).toHaveLength(2)
        expect(prependHistoryEntry(prependHistoryEntry([], imageFirst), emptyText)).toHaveLength(2)
      }),
      { numRuns: 200, seed: 42 },
    )
  })

  test("R2: legacy and current entries preserve and independently clone all part kinds", () => {
    fc.assert(
      fc.property(mixedPromptArbitrary, fc.boolean(), (parts, legacy) => {
        const original = structuredClone(parts)
        const entry = normalizePromptHistoryEntry(legacy ? parts : { prompt: parts, comments: [] })
        expect(entry).toStrictEqual({ prompt: original, comments: [] })
        expect(entry.prompt).not.toBe(parts)
        for (let index = 0; index < parts.length; index++) {
          expect(entry.prompt[index]).not.toBe(parts[index])
        }
        const file = entry.prompt[1]
        if (file.type !== "file") throw new Error("expected file")
        if (file.selection) {
          file.selection.startLine += 1
          file.selection.startChar += 1
        }
        const image = entry.prompt[3]
        if (image.type !== "image") throw new Error("expected image")
        image.filename += ".edited"
        entry.prompt.splice(0, 3)
        expect(parts).toStrictEqual(original)
      }),
      { numRuns: 200, seed: 42 },
    )
  })

  test("history capacity retains the newest distinct submissions in recall order", () => {
    fc.assert(
      fc.property(historyArbitrary(2), fc.nat({ max: 100 }), (submissions, choice) => {
        const capacity = 1 + (choice % (submissions.length - 1))
        const entries = submissions.reduce<PromptHistoryStoredEntry[]>(
          (entries, item) => prependHistoryEntry(entries, item.prompt, [], capacity),
          [],
        )
        expect(entries).toHaveLength(capacity)
        const state = editor(entries, prompt(""))
        const retained = submissions.slice(-capacity).reverse()
        for (const expected of retained) {
          expect(move(state, "up")).toBe(true)
          expect(state.currentPrompt).toStrictEqual(expected.prompt)
        }
        expect(move(state, "up")).toBe(false)
      }),
      { numRuns: 200, seed: 42 },
    )
  })

  test("R6: leaving history without a draft snapshot restores an empty editor", () => {
    fc.assert(
      fc.property(historyArbitrary(1), mixedPromptArbitrary, (entries, currentPrompt) => {
        const result = navigatePromptHistory({
          direction: "down",
          entries,
          historyIndex: 0,
          currentPrompt,
          currentComments: [],
          savedPrompt: null,
        })
        expect(result).toStrictEqual({
          handled: true,
          historyIndex: -1,
          savedPrompt: null,
          entry: { prompt: prompt(""), comments: [] },
          cursor: "end",
        })
      }),
      { numRuns: 200, seed: 42 },
    )
  })
})
