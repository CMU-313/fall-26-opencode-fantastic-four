import { TextAttributes, type ScrollBoxRenderable } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { createEffect, createResource, For, on, onCleanup, Show } from "solid-js"
import { useSDK } from "../../context/sdk"
import { useTheme } from "../../context/theme"
import { useDialog } from "../../ui/dialog"
import { useBindings } from "../../keymap"
import { errorMessage } from "../../util/error"

export function DialogWalkthrough(props: { sessionID: string }) {
  const sdk = useSDK()
  const dialog = useDialog()
  const { theme } = useTheme()
  const dimensions = useTerminalDimensions()
  const requests = new Set<AbortController>()
  const sessionID = props.sessionID
  let scroll: ScrollBoxRenderable | undefined
  const [result, { refetch }] = createResource(
    () => sessionID,
    async (sessionID) => {
      const abort = new AbortController()
      requests.add(abort)
      return sdk.walkthrough(sessionID, abort.signal).finally(() => requests.delete(abort))
    },
  )

  createEffect(() => dialog.setSize("large"))
  createEffect(
    on(
      () => props.sessionID,
      () => dialog.clear(),
      { defer: true },
    ),
  )
  onCleanup(() => requests.forEach((abort) => abort.abort()))
  useBindings(() => ({
    bindings: [
      { key: "up", desc: "Scroll up", group: "Walkthrough", cmd: () => scroll?.scrollBy(-1) },
      { key: "down", desc: "Scroll down", group: "Walkthrough", cmd: () => scroll?.scrollBy(1) },
      { key: "pageup", desc: "Previous page", group: "Walkthrough", cmd: () => scroll?.scrollBy(-10) },
      { key: "pagedown", desc: "Next page", group: "Walkthrough", cmd: () => scroll?.scrollBy(10) },
      {
        key: "r",
        desc: "Retry walkthrough",
        group: "Walkthrough",
        cmd: () => {
          if (result.error && !result.loading) void refetch()
        },
      },
    ],
  }))

  return (
    <box paddingLeft={2} paddingRight={2} paddingBottom={1} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          Learning walkthrough
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc
        </text>
      </box>
      <Show when={result.loading}>
        <text fg={theme.textMuted}>Preparing your learning walkthrough…</text>
      </Show>
      <Show when={!result.loading && result.error}>
        <text fg={theme.error}>{errorMessage(result.error)}</text>
        <text fg={theme.primary} onMouseUp={() => void refetch()}>
          Press r to try again
        </text>
      </Show>
      <Show when={!result.loading && !result.error}>
        <Show
          when={result()?.data.length}
          fallback={<text fg={theme.textMuted}>No completed changes to explain.</text>}
        >
          <scrollbox
            ref={(value) => {
              scroll = value
            }}
            maxHeight={Math.max(3, Math.floor(dimensions().height / 2))}
          >
            <For each={result()?.data}>
              {(entry) => (
                <box gap={1} paddingBottom={2}>
                  <text fg={theme.primary} attributes={TextAttributes.BOLD}>
                    {entry.file}
                  </text>
                  <text fg={theme.text} attributes={TextAttributes.BOLD}>
                    What changed
                  </text>
                  <text fg={theme.text}>{entry.whatChanged}</text>
                  <text fg={theme.text} attributes={TextAttributes.BOLD}>
                    Why it changed
                  </text>
                  <text fg={theme.text}>{entry.whyChanged}</text>
                  <text fg={theme.text} attributes={TextAttributes.BOLD}>
                    Programming concepts
                  </text>
                  <text fg={theme.text}>
                    {entry.concepts.length
                      ? entry.concepts.join("\n")
                      : "No programming concepts identified for this change."}
                  </text>
                </box>
              )}
            </For>
          </scrollbox>
          <text fg={theme.textMuted}>↑/↓ scroll · PgUp/PgDn page</text>
        </Show>
      </Show>
    </box>
  )
}
