import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { run } from './proc.ts'

export const git = async (cwd: string, ...args: string[]) => (await run('git', args, { cwd })).stdout.trim()

export interface Ref {
  /** In full, e.g. refs/heads/spike or refs/remotes/origin/spike. */
  ref: string
  sha: string
  /** What a symbolic ref, like a remote's HEAD, points at, in full; empty for any other. */
  symref: string
  /** When its commit was made, ms since epoch. */
  committedAt: number
}

/**
 * What every checkout of a repo shares. Worktrees each have their own HEAD and files, but one set of branches,
 * remotes and config, so a listing of them all reads these once.
 */
export interface Repo {
  /** The git common dir, absolute. */
  common: string
  remotes: string[]
  /** Some remote is on GitHub, so a pull request might say what a branch's base is. */
  github: boolean
  /** The branch the main checkout has out, empty with HEAD detached. */
  mainBranch: string
  /** Branches, here and on remotes, most recently committed first. */
  refs: Ref[]
}

export async function readRepo(path: string): Promise<Repo> {
  const [common, remotes, refs] = await Promise.all([
    git(path, 'rev-parse', '--git-common-dir').then((dir) => resolve(path, dir)),
    git(path, 'remote', '-v').catch(() => ''),
    git(path, 'for-each-ref', '--sort=-committerdate', '--format=%(refname)%00%(objectname)%00%(symref)%00%(committerdate:unix)', 'refs/heads', 'refs/remotes'),
  ])
  // The main checkout's HEAD is the common dir's own; reading it saves asking git there. A reftable repo's
  // HEAD file is only a stub naming refs/heads/.invalid, so that one asks.
  let mainBranch = /^ref: refs\/heads\/(.+)$/m.exec(await readFile(join(common, 'HEAD'), 'utf8').catch(() => ''))?.[1].trim() ?? ''
  if (mainBranch === '.invalid') mainBranch = await git(common, 'symbolic-ref', '-q', '--short', 'HEAD').catch(() => '')
  return {
    common,
    // e.g. "origin\tgit@github.com:me/repo.git (fetch)", once for fetching and again for pushing.
    remotes: [...new Set(remotes.split('\n').filter(Boolean).map((line) => line.split('\t')[0]))],
    github: /github/i.test(remotes),
    mainBranch,
    refs: refs
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [ref, sha, symref, at] = line.split('\0')
        return { ref, sha, symref, committedAt: Number(at) * 1000 }
      }),
  }
}

/** A branch's commit, by the name git shows it by: develop, or origin/develop for a remote's. A local one wins, as with git. */
export function tipOf(repo: Repo, branch: string): string | undefined {
  return (repo.refs.find((r) => r.ref === `refs/heads/${branch}`) ?? repo.refs.find((r) => r.ref === `refs/remotes/${branch}`))?.sha
}

/** Where a checkout stands, from `git status --porcelain=v2 --branch`: one call for its branch, upstream and files. */
export interface Status {
  /** Empty with HEAD detached. */
  branch: string
  /** Empty in a repo with no commits yet. */
  head: string
  /** Only one that's there to compare with: an upstream whose branch was deleted doesn't count. */
  upstream?: string
  ahead: number
  behind: number
  /** Files with uncommitted changes, untracked ones included. */
  changes: number
}

export function parseStatus(out: string): Status {
  const status: Status = { branch: '', head: '', ahead: 0, behind: 0, changes: 0 }
  let upstream: string | undefined
  let compared = false
  for (const line of out.split('\n')) {
    if (!line) continue
    if (!line.startsWith('# ')) {
      status.changes++
      continue
    }
    const [key, a = '', b = ''] = line.slice(2).split(' ')
    if (key === 'branch.oid') status.head = a === '(initial)' ? '' : a
    else if (key === 'branch.head') status.branch = a === '(detached)' ? '' : a
    else if (key === 'branch.upstream') upstream = a
    else if (key === 'branch.ab') {
      // "+3 -1"
      compared = true
      status.ahead = Math.abs(Number(a))
      status.behind = Math.abs(Number(b))
    }
  }
  if (upstream && compared) status.upstream = upstream
  return status
}

export const readStatus = async (path: string) => parseStatus(await git(path, 'status', '--porcelain=v2', '--branch'))
