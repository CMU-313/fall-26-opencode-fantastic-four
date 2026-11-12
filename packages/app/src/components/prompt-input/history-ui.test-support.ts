import { readFileSync } from "node:fs"
import ts from "typescript"
import type { Prompt } from "@/context/prompt"
import {
  navigatePromptHistory,
  promptLength,
  type PromptHistoryComment,
  type PromptHistoryEntry,
  type PromptHistoryStoredEntry,
} from "./history"

type HistoryState = {
  mode: "normal" | "shell"
  historyIndex: number
  savedPrompt: PromptHistoryEntry | null
  applyingHistory: boolean
}

type Bindings = {
  promptLength: typeof promptLength
  navigatePromptHistory: typeof navigatePromptHistory
  prompt: { current: () => Prompt; set: (parts: Prompt, cursor: number) => void }
  store: HistoryState
  history: { entries: (mode: HistoryState["mode"]) => PromptHistoryStoredEntry[] }
  historyComments: () => PromptHistoryComment[]
  setStore: <K extends keyof HistoryState>(key: K, value: HistoryState[K]) => void
  applyHistoryComments: (comments: PromptHistoryComment[]) => void
  requestAnimationFrame: (callback: () => void) => void
  editorRef: { focus: () => void }
  setCursorPosition: (editor: Bindings["editorRef"], cursor: number) => void
  queueScroll: () => void
}

// Execute the real component callbacks, including the prompt.set boundary that
// helper-only tests miss. AST extraction avoids mounting unrelated UI providers
// or copying the callbacks into this test. Fail if a refactor removes/duplicates
// either callback. Only editor focus, scrolling, and frame scheduling are adapted;
// this is not a DOM/caret or full-component rendering test.
const source = ts.createSourceFile(
  "prompt-input.tsx",
  readFileSync(new URL("../prompt-input.tsx", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
)
const names = ["applyHistoryPrompt", "navigateHistory"]
const callbacks = new Map<string, string>()
const visit = (node: ts.Node) => {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && names.includes(node.name.text)) {
    if (!node.initializer || !ts.isArrowFunction(node.initializer) || callbacks.has(node.name.text)) {
      throw new Error(`Expected one arrow callback for ${node.name.text}`)
    }
    callbacks.set(node.name.text, `const ${node.name.text} = ${node.initializer.getText(source)};`)
  }
  ts.forEachChild(node, visit)
}
visit(source)
if (callbacks.size !== names.length) throw new Error("PromptInput history callbacks were not found")
const compiled = ts.transpileModule(`${names.map((name) => callbacks.get(name)).join("\n")}\nreturn navigateHistory;`, {
  compilerOptions: { target: ts.ScriptTarget.ESNext },
}).outputText
const bind = new Function(
  "bindings",
  `const { promptLength, navigatePromptHistory, prompt, store, history, historyComments, setStore,
    applyHistoryComments, requestAnimationFrame, editorRef, setCursorPosition, queueScroll } = bindings;
    ${compiled}`,
) as (bindings: Bindings) => (direction: "up" | "down") => boolean

export function historyUI(entries: PromptHistoryStoredEntry[], draft: Prompt) {
  const history = structuredClone(entries)
  const editor = { prompt: structuredClone(draft), comments: [] as PromptHistoryComment[], cursor: 0 }
  const state: HistoryState = { mode: "normal", historyIndex: -1, savedPrompt: null, applyingHistory: false }
  const navigate = bind({
    promptLength,
    navigatePromptHistory,
    prompt: {
      current: () => editor.prompt,
      set: (parts, cursor) => {
        editor.prompt = parts
        editor.cursor = cursor
      },
    },
    store: state,
    history: { entries: () => history },
    historyComments: () => editor.comments,
    setStore: (key, value) => {
      state[key] = value
    },
    applyHistoryComments: (comments) => {
      editor.comments = comments
    },
    requestAnimationFrame: (callback) => callback(),
    editorRef: { focus: () => {} },
    setCursorPosition: (_editor, cursor) => {
      editor.cursor = cursor
    },
    queueScroll: () => {},
  })
  return { navigate, editor, state, history }
}
