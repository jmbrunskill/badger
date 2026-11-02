/**
 * Chips in a prompt: files mentioned as `@path` (`@"a path"` when it has spaces) and the slash command or skill it
 * starts with, as `/name`. A prompt is still plain text, which is what's saved and sent; chips are how it's shown.
 */

export type Chip = { kind: 'file'; value: string } | { kind: 'command'; value: string }

export type Segment = string | Chip

/** How a chip is written in the text. */
export function chipText(chip: Chip): string {
  if (chip.kind === 'command') return `/${chip.value}`
  return /\s/.test(chip.value) ? `@"${chip.value}"` : `@${chip.value}`
}

/** A command at the very start: Claude Code only runs one there. A path like `/etc/hosts` isn't one. */
export const COMMAND = /^\/([\w][\w:.-]*)(?=\s|$)/
/** A mention starts the text or follows a space, so an email address isn't one. */
const MENTION = /(^|\s)@(?:"([^"\n]+)"|([^\s"]+))/g

/**
 * The text as plain runs and chips. Only mentions that look like paths, with a `/` or a `.`, are chips, so
 * `@someone` or a Java `@Override` pasted in stays text, unless `file` knows it is one, like a picked `Makefile`.
 */
export function segments(
  text: string,
  opts: { command?: boolean | ((name: string) => boolean); file?: (path: string) => boolean } = {},
): Segment[] {
  const out: Segment[] = []
  let rest = text
  const command = opts.command !== false ? COMMAND.exec(rest) : null
  if (command && (typeof opts.command !== 'function' || opts.command(command[1]))) {
    out.push({ kind: 'command', value: command[1] })
    rest = rest.slice(command[0].length)
  }
  let at = 0
  for (const m of rest.matchAll(MENTION)) {
    const path = m[2] ?? m[3]
    // Trailing punctuation is the sentence's, not the path's, unless it's a folder's slash.
    const trimmed = m[2] ? path : path.replace(/[,;:!?)\]}'.]+$/, '')
    if (!(/[/.]/.test(trimmed) || opts.file?.(trimmed)) || trimmed === '.' || trimmed === '..') continue
    const start = m.index + m[1].length
    if (start > at) out.push(rest.slice(at, start))
    out.push({ kind: 'file', value: trimmed })
    at = start + 1 + (m[2] ? path.length + 2 : trimmed.length)
  }
  if (at < rest.length) out.push(rest.slice(at))
  return out
}
