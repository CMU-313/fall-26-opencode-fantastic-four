import type { SessionWalkthrough } from "@opencode-ai/schema/session-walkthrough"
import { Dialog } from "@opencode-ai/ui/dialog"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Button } from "@opencode-ai/ui/button"
import { createEffect, For, Match, onCleanup, onMount, Switch } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"

export function DialogWalkthrough(props: {
  current: () => boolean
  request: (signal: AbortSignal) => Promise<{ readonly data: readonly SessionWalkthrough.Entry[] }>
}) {
  const language = useLanguage()
  const dialog = useDialog()
  createEffect(() => {
    if (!props.current()) dialog.close()
  })
  const controller = new AbortController()
  const [state, setState] = createStore({
    loading: true,
    failed: false,
    entries: [] as readonly SessionWalkthrough.Entry[],
  })
  const request = () => {
    setState({ loading: true, failed: false })
    void props.request(controller.signal).then(
      (result) => {
        if (!controller.signal.aborted) setState({ loading: false, entries: result.data })
      },
      () => {
        if (!controller.signal.aborted) setState({ loading: false, failed: true })
      },
    )
  }
  onMount(request)
  onCleanup(() => controller.abort())

  return (
    <Dialog title={language.t("command.session.walkthrough")} size="large">
      <div class="px-6 pb-6 overflow-y-auto flex flex-col gap-6" aria-busy={state.loading}>
        <Switch>
          <Match when={state.loading}>
            <p role="status">{language.t("walkthrough.loading")}</p>
          </Match>
          <Match when={state.failed}>
            <p role="alert">{language.t("walkthrough.error")}</p>
            <Button onClick={request}>{language.t("walkthrough.retry")}</Button>
          </Match>
          <Match when={state.entries.length === 0}>
            <p>{language.t("walkthrough.empty")}</p>
          </Match>
          <Match when={state.entries.length > 0}>
            <For each={state.entries}>
              {(entry) => (
                <article class="flex flex-col gap-3">
                  <h3 class="font-mono text-text-strong break-all">{entry.file}</h3>
                  <dl class="flex flex-col gap-2">
                    <dt class="font-medium">{language.t("walkthrough.whatChanged")}</dt>
                    <dd class="whitespace-pre-wrap">{entry.whatChanged}</dd>
                    <dt class="font-medium">{language.t("walkthrough.whyChanged")}</dt>
                    <dd class="whitespace-pre-wrap">{entry.whyChanged}</dd>
                    <dt class="font-medium">{language.t("walkthrough.concepts")}</dt>
                    <dd>
                      <ul class="list-disc pl-5">
                        <For each={entry.concepts}>{(concept) => <li>{concept}</li>}</For>
                      </ul>
                    </dd>
                  </dl>
                </article>
              )}
            </For>
          </Match>
        </Switch>
      </div>
    </Dialog>
  )
}
