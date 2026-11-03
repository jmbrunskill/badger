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
 * `glued`: the text carries straight on from something before it, e.g. code, so an `@` it starts with is no mention.
 */
export function segments(
  text: string,
  opts: { command?: boolean | ((name: string) => boolean); file?: (path: string) => boolean; glued?: boolean } = {},
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
    if (opts.glued && m.index === 0 && !m[1]) continue
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

/**
 * Code and links in a prompt, as Claude reads them: a fenced block, from its opening fence line to its closing one,
 * `inline code`, and web addresses outside both. They're only how the text is shown; it's sent as typed.
 */
export type Span =
  | { kind: 'code'; from: number; to: number }
  | { kind: 'url'; from: number; to: number }
  /** `code` is where the code inside the fences is, `lang` what its opening fence says it's in, and `closed` whether it's closed. */
  | { kind: 'fence'; from: number; to: number; code: { from: number; to: number }; lang?: string; closed: boolean }

/** A backtick fence's line has no other backtick, or ```x``` starting a line would be one rather than inline code. */
const FENCE = /^ {0,3}(?:(`{3,})(?=[^`]*$)|(~{3,}))\s*(\S*)/
/** Not after a backtick or a backslash, which would make it part of a longer run, or escaped. */
const INLINE_CODE = /(?<![`\\])(`+)(?!`)[^\n]*?[^`\n]\1(?!`)/g
/** `￼` is a chip in the composer, which ends one. */
const WEB_URL = /\bhttps?:\/\/[^\s<>"'`￼]+/g

/** Where each span is in the text, in order; none overlap. */
export function spans(text: string): Span[] {
  const out: Span[] = []
  let fence: { mark: string; lang: string; from: number; code: number } | undefined
  let at = 0
  for (const line of text.split('\n')) {
    const end = at + line.length
    const open = FENCE.exec(line)
    const mark = open?.[1] ?? open?.[2]
    if (fence) {
      // Closed by a fence of the same character, at least as long, with nothing after it.
      if (mark && mark[0] === fence.mark[0] && mark.length >= fence.mark.length && !line.trim().slice(mark.length).trim()) {
        const code = { from: fence.code, to: Math.max(fence.code, at - 1) }
        out.push({ kind: 'fence', from: fence.from, to: end, code, lang: fence.lang.toLowerCase() || undefined, closed: true })
        fence = undefined
      }
    } else if (mark) fence = { mark, lang: open![3], from: at, code: end + 1 }
    else inlineSpans(line, at, out)
    at = end + 1
  }
  // One left open runs to the end, as it does in Markdown.
  if (fence) {
    const code = { from: Math.min(fence.code, text.length), to: text.length }
    out.push({ kind: 'fence', from: fence.from, to: text.length, code, lang: fence.lang.toLowerCase() || undefined, closed: false })
  }
  return out
}

function inlineSpans(line: string, offset: number, out: Span[]) {
  let at = 0
  const urls = (to: number) => {
    for (const m of line.slice(at, to).matchAll(WEB_URL)) {
      const url = trimUrl(m[0])
      // Nothing left after the scheme: not an address.
      if (url.endsWith('://')) continue
      const from = offset + at + m.index
      out.push({ kind: 'url', from, to: from + url.length })
    }
  }
  for (const m of line.matchAll(INLINE_CODE)) {
    urls(m.index)
    out.push({ kind: 'code', from: offset + m.index, to: offset + m.index + m[0].length })
    at = m.index + m[0].length
  }
  urls(line.length)
}

/** Trailing punctuation is the sentence's, and a closing bracket only the address's if it opened one too. */
function trimUrl(url: string): string {
  for (;;) {
    const last = url.at(-1)!
    const open = ({ ')': '(', ']': '[', '}': '{' } as Record<string, string>)[last]
    if (/[.,;:!?*_]/.test(last)) url = url.slice(0, -1)
    else if (open && url.split(open).length < url.split(last).length) url = url.slice(0, -1)
    else return url
  }
}
