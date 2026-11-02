import { Show, splitProps, type JSX } from 'solid-js'
import { SIGN } from '../diffRows.ts'

const TINT = { add: 'bg-ok/10', del: 'bg-danger/10', ctx: '' } as const
const SIGN_TONE = { add: 'text-ok', del: 'text-danger', ctx: 'text-fg-3' } as const

/**
 * A line of code with its number on the left: in a hunk, its number in the file it's in, before for a line taken out
 * (fainter) and after for the rest, then its + or −; in a whole file, its one number. `gutter` goes on the number, e.g.
 * what picking a line by it does. The code itself is the children, since how it wraps and what's drawn on it is the
 * caller's.
 */
export function CodeRow(
  props: JSX.HTMLAttributes<HTMLDivElement> & {
    kind?: 'add' | 'del' | 'ctx'
    number?: number
    /** Digits the number gets room for, the same down a file so its code lines up: 4, unless its numbers go past. */
    digits?: number
    /** The diff's +, − or space after the number. */
    sign?: boolean
    /** Gone to just now, so the eye finds it. */
    lit?: boolean
    gutter?: JSX.HTMLAttributes<HTMLSpanElement>
    children: JSX.Element
  },
) {
  const [local, rest] = splitProps(props, ['kind', 'number', 'digits', 'sign', 'lit', 'gutter', 'children', 'class'])
  return (
    <div {...rest} class={`group relative flex transition-colors ${local.lit ? 'bg-accent/20' : TINT[local.kind ?? 'ctx']} ${local.class ?? ''}`}>
      <span {...local.gutter} class={`flex shrink-0 select-none ${local.gutter?.class ?? ''}`}>
        <span
          class={`pr-1.5 pl-1 text-right tabular-nums ${local.kind === 'del' ? 'text-fg-3/40' : 'text-fg-3/70'}`}
          style={{ width: `calc(${Math.max(4, local.digits ?? 0)}ch + 0.625rem)` }}
        >
          {local.number ?? ''}
        </span>
      </span>
      <Show when={local.sign}>
        <span class={`w-4 shrink-0 select-none text-center ${SIGN_TONE[local.kind ?? 'ctx']}`}>{SIGN[local.kind ?? 'ctx']}</span>
      </Show>
      {local.children}
    </div>
  )
}
