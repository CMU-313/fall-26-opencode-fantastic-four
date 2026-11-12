import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { MenuV2 } from "@opencode-ai/ui/v2/menu-v2"
import { useLanguage } from "@/context/language"

export function SelectionActionsV2(props: { onExplain: VoidFunction; onAdd: VoidFunction }) {
  const language = useLanguage()
  return (
    <div class="flex items-center overflow-hidden rounded-md">
      <ButtonV2 type="button" size="normal" variant="contrast" class="!rounded-none" onClick={props.onExplain}>
        {language.t("command.context.explainSelection")}
      </ButtonV2>
      <MenuV2 gutter={4} placement="bottom-end">
        <MenuV2.Trigger
          as={ButtonV2}
          type="button"
          size="normal"
          variant="contrast"
          icon="chevron-down"
          class="!rounded-none border-l border-v2-border-border-muted px-2"
          aria-label={language.t("prompt.explainSelection.moreActions")}
        />
        <MenuV2.Portal>
          <MenuV2.Content>
            <MenuV2.Item onSelect={props.onAdd}>{language.t("command.context.addSelection")}</MenuV2.Item>
          </MenuV2.Content>
        </MenuV2.Portal>
      </MenuV2>
    </div>
  )
}
