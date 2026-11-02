import { For, Show } from 'solid-js'
import { Dynamic } from 'solid-js/web'
import { File, Folder, SquareSlash } from '../icons'
import { fileLink, useOpenFile } from '../fileLinks.ts'
import { chipText, segments, type Chip } from '../prompt.ts'

const CHIP = 'rounded-md bg-well px-1 py-px box-decoration-clone text-fg'

/** A file or command as a chip, with its full path or name. */
export function PromptChip(props: { chip: Chip; onClick?: () => void }) {
  const icon = () => (props.chip.kind === 'command' ? SquareSlash : props.chip.value.endsWith('/') ? Folder : File)
  const body = () => (
    <>
      <Dynamic component={icon()} class="mr-1 inline-block size-[0.9em] align-[-0.1em] text-fg-3" />
      {props.chip.kind === 'command' ? `/${props.chip.value}` : props.chip.value}
    </>
  )
  return (
    <Show when={props.onClick} fallback={<span class={CHIP} title={chipText(props.chip)}>{body()}</span>}>
      <button type="button" class={`${CHIP} cursor-pointer text-left hover:bg-surface`} title={`Open ${props.chip.value}`} onClick={props.onClick}>
        {body()}
      </button>
    </Show>
  )
}

/** A sent prompt's text, its mentioned files as chips that open them and, if it was one, the command it starts with as one too. */
export function PromptText(props: { text: string; command?: boolean }) {
  const files = useOpenFile()
  const open = (chip: Chip) => {
    if (!files || chip.kind !== 'file' || chip.value.endsWith('/')) return
    const link = fileLink(chip.value, files.cwd())
    return link && (() => files.open(link.path, link.line))
  }
  return (
    <For each={segments(props.text, { command: !!props.command })}>{(s) => (typeof s === 'string' ? s : <PromptChip chip={s} onClick={open(s)} />)}</For>
  )
}
