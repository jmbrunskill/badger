import { For, Show, type Component } from 'solid-js'
import { ArrowDown, ArrowDownToLine, ArrowUp, Check, CloudOff, GitBranch, GitMerge, Pencil } from '../icons'
import type { GitStatus } from '../../shared/protocol.ts'
import { showBy } from './Popover.tsx'
import { DiffCount, ltr, plural } from './ui.tsx'

export interface GitPart {
  text: string
  count?: number
  icon: Component<{ class?: string }>
  tone: string
  /** What it means, in full. */
  title: string
}

/** What isn't in step, each with its icon, for the summary and anywhere that spells it out. */
export function gitParts(g: GitStatus, hide?: 'ahead' | 'behind'): GitPart[] {
  const out: GitPart[] = []
  if (g.ahead && hide !== 'ahead')
    out.push(
      g.upstream
        ? { text: `${g.ahead} ahead`, count: g.ahead, icon: ArrowUp, tone: 'text-fg-2', title: `Commits ${g.upstream} doesn't have` }
        : { text: `${g.ahead} not pushed`, count: g.ahead, icon: ArrowUp, tone: 'text-fg-2', title: g.remote ? `Commits no remote has; ${g.branch || 'HEAD'} isn't on ${g.remote} yet` : 'Commits no remote has' },
    )
  if (g.behind && hide !== 'behind') out.push({ text: `${g.behind} behind`, count: g.behind, icon: ArrowDown, tone: 'text-fg-2', title: `Commits on ${g.upstream} not here` })
  if (g.base?.ahead) out.push({ text: `${g.base.ahead} unmerged`, count: g.base.ahead, icon: GitMerge, tone: 'text-fg-2', title: `Commits ${g.base.branch} doesn't have` })
  if (g.base?.behind)
    out.push({ text: `${g.base.behind} behind ${g.base.branch}`, count: g.base.behind, icon: ArrowDownToLine, tone: 'text-fg-3', title: `Commits on ${g.base.branch} not here` })
  if (!g.upstream && !g.remote) out.push({ text: 'no remote', icon: CloudOff, tone: 'text-fg-3', title: 'This repo has no remote to push to' })
  return out
}

/**
 * How a checkout stands, the same wherever one is shown: its branch, what's
 * uncommitted, and then only what isn't in step, each as its icon and number.
 * Nothing after the branch means there's nothing to do. `hide` leaves out what
 * a button beside it says. GitDetail spells each one out.
 */
export function GitSummary(props: { git: GitStatus; branch?: boolean; hide?: 'ahead' | 'behind'; class?: string }) {
  return (
    <span class={`flex min-w-0 items-center gap-2 whitespace-nowrap ${props.class ?? ''}`}>
      <Show when={props.branch}>
        {/* At the least, its icon: down to that, rather than spill over what's next to it. */}
        <span class="flex min-w-3.5 items-center gap-1 font-mono text-fg-2">
          <GitBranch class="size-3.5 shrink-0 text-fg-3" />
          <span class="truncate">{props.git.branch || 'detached'}</span>
        </span>
      </Show>
      <DiffCount files={props.git.changes} added={props.git.added} removed={props.git.removed} class="shrink-0" />
      <For each={gitParts(props.git, props.hide)}>
        {(p) => (
          <span class={`flex shrink-0 items-center gap-0.5 tabular-nums ${p.tone}`} title={`${p.text}: ${p.title}`}>
            <p.icon class="size-3.5" />
            {p.count}
          </span>
        )}
      </For>
    </span>
  )
}

/** Everything the summary says in icons, spelled out: the branch and where it is, what's uncommitted, and each part in words. */
export function GitDetail(props: { git: GitStatus; path?: string; class?: string }) {
  const g = () => props.git
  return (
    <div class={`flex flex-col gap-2 text-ui ${props.class ?? ''}`}>
      <div class="min-w-0">
        <div class="flex items-center gap-1.5 font-mono text-fg">
          <GitBranch class="size-3.5 shrink-0 text-fg-3" />
          <span class="truncate">{g().branch || 'Detached HEAD'}</span>
        </div>
        <Show when={props.path}>
          <div class="mt-0.5 truncate text-left font-mono text-meta text-fg-3 [direction:rtl]">{ltr(props.path!)}</div>
        </Show>
      </div>
      <div class="flex items-center gap-2">
        <Pencil class="size-3.5 shrink-0 text-fg-3" />
        <Show when={g().changes} fallback={<span class="text-fg-3">Nothing uncommitted</span>}>
          <span class="text-fg-2">
            {plural(g().changes, 'file')} uncommitted <DiffCount files={g().changes} added={g().added} removed={g().removed} class="ml-1" />
          </span>
        </Show>
      </div>
      <Show when={g().upstream && !g().ahead && !g().behind}>
        <div class="flex items-center gap-2 text-fg-3">
          <Check class="size-3.5 shrink-0" />
          In step with {g().upstream}
        </div>
      </Show>
      <For each={gitParts(g())}>
        {(p) => (
          <div class="flex items-start gap-2">
            <p.icon class={`mt-0.5 size-3.5 shrink-0 ${p.tone}`} />
            <div class="min-w-0">
              <div class={p.tone}>{p.text}</div>
              <div class="text-xs leading-snug text-fg-3">{p.title}</div>
            </div>
          </div>
        )}
      </For>
    </div>
  )
}

/** The summary as a button that floats its detail by it, for where a click on it would otherwise pick what it's in. */
export function GitSummaryButton(props: { git: GitStatus; path?: string; branch?: boolean; class?: string }) {
  return (
    <button
      type="button"
      title="Git status"
      onClick={(e) => {
        e.stopPropagation()
        showBy(e.currentTarget, 'Git status', () => <GitDetail git={props.git} path={props.path} />)
      }}
      class={`-mx-1 min-w-0 rounded-md px-1 py-0.5 transition-colors hover:bg-bg ${props.class ?? ''}`}
    >
      <GitSummary git={props.git} branch={props.branch} />
    </button>
  )
}
