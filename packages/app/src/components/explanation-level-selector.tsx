import { Select } from "@opencode-ai/ui/select"
import { SelectV2 } from "@opencode-ai/ui/v2/select-v2"
import { Match, Switch } from "solid-js"
import type { PromptInputState } from "@/components/prompt-input/contracts"
import { useLanguage } from "@/context/language"
import { EXPLANATION_LEVELS, type ExplanationLevel } from "@/learning/explanation-level"

export type ExplanationLevelSelectorProps = {
  state: Pick<PromptInputState, "explanationLevel">
  variant?: "legacy" | "v2"
  onSelect?: () => void
}

export function ExplanationLevelSelector(props: ExplanationLevelSelectorProps) {
  const language = useLanguage()
  const levels = [...EXPLANATION_LEVELS]
  const label = (level: ExplanationLevel) =>
    ({
      beginner: language.t("prompt.explanationLevel.beginner"),
      intermediate: language.t("prompt.explanationLevel.intermediate"),
      advanced: language.t("prompt.explanationLevel.advanced"),
    })[level]
  const select = (level: ExplanationLevel | undefined | null) => {
    if (!level) return
    props.state.explanationLevel.set(level)
    props.onSelect?.()
  }

  return (
    <div data-component="explanation-level-selector">
      <Switch>
        <Match when={props.variant === "v2"}>
          <SelectV2
            appearance="inline"
            options={levels}
            current={props.state.explanationLevel.current()}
            label={label}
            onSelect={select}
            aria-label={language.t("prompt.explanationLevel.label")}
            class="max-w-[150px]"
            valueClass="truncate"
          />
        </Match>
        <Match when={true}>
          <Select
            size="normal"
            variant="ghost"
            options={levels}
            current={props.state.explanationLevel.current()}
            label={label}
            onSelect={select}
            class="max-w-[150px] text-text-base"
            valueClass="truncate text-13-regular text-text-base"
            triggerProps={{
              "aria-label": language.t("prompt.explanationLevel.label"),
              "data-action": "prompt-explanation-level",
            }}
          />
        </Match>
      </Switch>
    </div>
  )
}
