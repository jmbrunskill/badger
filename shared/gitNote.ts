/** How the note on what changed in git since a chat's last turn starts. It comes last in the turn's context. */
export const GIT_NOTE_PREFIX = 'Git changed in this checkout since your last turn: '

/** A turn's context, split into the git note at its end, if any, and the rest. */
export function splitGitNote(text: string): { git?: string; rest: string } {
  if (text.startsWith(GIT_NOTE_PREFIX)) return { git: text, rest: '' }
  const at = text.lastIndexOf(`\n\n${GIT_NOTE_PREFIX}`)
  if (at < 0) return { rest: text }
  return { git: text.slice(at + 2), rest: text.slice(0, at) }
}
