import { Show } from 'solid-js'
import { resolvePath, useOpenFile } from '../fileLinks.ts'

/**
 * A file's path, opening it as it is now beside the chat; plain text where there's nowhere to open it. For a path over
 * a copy of a file, e.g. what Claude was given from CLAUDE.md or a skill, which the file may have moved on from.
 */
export function PathLink(props: { path: string; title?: string; class?: string }) {
  const files = useOpenFile()
  const path = () => resolvePath(props.path, files?.cwd())
  return (
    <Show when={files && path()} fallback={<div class={`font-mono text-xs text-fg-3 ${props.class ?? ''}`}>{props.path}</div>}>
      {(p) => (
        <button
          type="button"
          title={props.title ?? 'Open the file as it is now'}
          onClick={() => files!.open(p())}
          class={`block max-w-full truncate text-left font-mono text-xs text-fg-3 underline decoration-transparent underline-offset-3 transition-colors hover:text-fg-2 hover:decoration-edge ${props.class ?? ''}`}
        >
          {props.path}
        </button>
      )}
    </Show>
  )
}
