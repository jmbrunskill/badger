import { GIT_NOTE_PREFIX } from '../../shared/gitNote.ts'
import { type Status, readStatus } from '../repo.ts'

/** Where a chat's checkout stood when its last turn ended. Kept per chat, so it outlives a process closed for idling. */
const marks = new Map<string, { cwd: string; status: Status }>()

/** Notes where the chat's checkout stands now its turn has ended; outside a repo, there's nothing to compare with. */
export async function markGit(sessionId: string, cwd: string): Promise<void> {
  const status = await readStatus(cwd).catch(() => undefined)
  if (status) marks.set(sessionId, { cwd, status })
  else marks.delete(sessionId)
}

/**
 * What changed in the chat's checkout since its last turn ended, e.g. the user pushed or switched branch,
 * so Claude doesn't go on about what it saw before. Undefined if nothing did, or there's no turn to compare with.
 */
export async function gitNote(sessionId: string, cwd: string): Promise<string | undefined> {
  const before = marks.get(sessionId)
  if (!before || before.cwd !== cwd) return undefined
  const now = await readStatus(cwd).catch(() => undefined)
  if (!now) return undefined
  const was = before.status
  if (now.branch === was.branch && now.head === was.head && now.upstream === was.upstream && now.ahead === was.ahead && now.behind === was.behind) return undefined
  const short = (sha: string) => sha.slice(0, 7) || 'no commits'
  const branch = now.branch ? `on ${now.branch}` : 'HEAD detached'
  const parts = [
    now.branch === was.branch ? branch : `${branch} (was ${was.branch || 'detached'})`,
    now.head === was.head ? `at ${short(now.head)}` : `at ${short(now.head)} (was ${short(was.head)})`,
    sync(now),
  ]
  return `${GIT_NOTE_PREFIX}${parts.join(', ')}. You didn't do this; most likely the user did, e.g. pushing themselves. Go by it rather than what you saw before, and don't ask them to push or pull what's already done.`
}

function sync({ upstream, ahead, behind }: Status): string {
  if (!upstream) return 'with no upstream'
  if (!ahead && !behind) return `in step with ${upstream}, so everything is pushed`
  const commits = (n: number) => `${n} commit${n === 1 ? '' : 's'}`
  return [ahead && `${commits(ahead)} not pushed to ${upstream}`, behind && `${commits(behind)} on ${upstream} not pulled`].filter(Boolean).join(' and ')
}
