import { For, Show, createEffect, createMemo, createResource, createSignal, createUniqueId, on, onCleanup, onMount, type JSX } from 'solid-js'
import { Portal } from 'solid-js/web'
import { ChevronRight, CornerLeftUp, Ellipsis, File, Folder } from '../icons'
import type { FileEntry, Listing } from '../../shared/protocol.ts'
import { api } from '../api.ts'
import { createDismiss, floatBy, ltr } from './ui.tsx'

const WIDTH = 288

interface Crumb {
  name: string
  /** The folder or file it names. */
  full: string
  /** The folder it's in, listed when it's clicked. */
  parent: string
}

const join = (dir: string, name: string) => `${dir.replace(/\/$/, '')}/${name}`

/** What's listed: a folder, with what to mark in it, or the folders squeezed out of the bar. */
type Open = { at: HTMLElement } & ({ dir: string; mark?: string } | { folded: Crumb[] })

/**
 * A file's path as folders to click, like an editor's breadcrumbs: each lists the folder it's in, to open a file
 * beside it or walk elsewhere. Inside `root` it starts there. Folders that don't fit fold into an ellipsis, middle
 * ones first, so the file's name is the last to go.
 */
export function Breadcrumbs(props: {
  path: string
  root?: string
  machine: string
  onOpen?: (path: string) => void
  /** Shown right after the last crumb, e.g. its counts. */
  after?: JSX.Element
  class?: string
}) {
  const crumbs = createMemo((): Crumb[] => {
    const inRoot = props.root && props.path.startsWith(`${props.root}/`)
    const base = inRoot ? props.root! : ''
    const names = (inRoot ? props.path.slice(base.length + 1) : props.path).split('/').filter(Boolean)
    return names.map((name, i) => {
      const parent = names.slice(0, i).reduce(join, base) || '/'
      return { name, full: join(parent, name), parent }
    })
  })

  // How many are folded, taken from the middle out and then the first: see `fit`.
  const [folded, setFolded] = createSignal(0)
  const foldOrder = () => {
    const n = crumbs().length
    return n < 2 ? [] : [...Array.from({ length: n - 2 }, (_, i) => i + 1), 0]
  }
  const hidden = createMemo(() => new Set(foldOrder().slice(0, folded())))

  // The box takes the room it's given, not the room the crumbs want, so folding them doesn't resize what's watched.
  let box!: HTMLDivElement
  let nav!: HTMLElement
  let last: HTMLElement | undefined
  /** Folds until the file's name shows whole, or there's nothing left to fold. */
  const fit = () => {
    setFolded(0)
    while (last && last.scrollWidth > last.clientWidth && folded() < foldOrder().length) setFolded((f) => f + 1)
  }
  onMount(() => {
    const watch = new ResizeObserver(fit)
    watch.observe(box)
    onCleanup(() => watch.disconnect())
  })
  createEffect(on(crumbs, fit, { defer: true }))

  const [open, setOpen] = createSignal<Open>()
  const toggle = (at: HTMLElement, next: Omit<Open, 'at'>) => setOpen((o) => (o?.at === at ? undefined : ({ at, ...next } as Open)))

  const crumbClass = (at: () => boolean) =>
    `flex h-6 min-w-0 items-center rounded px-1 transition-colors pointer-coarse:h-8 ${
      at() ? 'bg-surface text-fg' : 'hover:bg-surface hover:text-fg-2'
    }`
  const isOpen = (el: () => HTMLElement | undefined) => () => !!el() && open()?.at === el()

  return (
    <div ref={box} class={`flex min-w-0 flex-1 items-center gap-3 ${props.class ?? ''}`}>
      <nav ref={nav} aria-label="Path" class="flex min-w-0 items-center font-mono">
      <For each={crumbs()}>
        {(c, i) => {
          let el!: HTMLButtonElement
          const file = () => i() === crumbs().length - 1
          const ellipsis = () => hidden().has(i()) && !hidden().has(i() - 1)
          let dots: HTMLButtonElement | undefined
          return (
            <>
              <Show when={ellipsis()}>
                <Show when={i() > 0}>
                  <ChevronRight class="size-3 shrink-0 text-fg-3/60" />
                </Show>
                <button
                  ref={dots}
                  type="button"
                  title="Folders that don't fit"
                  onClick={() => toggle(dots!, { folded: crumbs().filter((_, j) => hidden().has(j)) })}
                  class={`${crumbClass(isOpen(() => dots))} shrink-0`}
                >
                  <Ellipsis class="size-3.5" />
                </button>
              </Show>
              <Show when={!hidden().has(i())}>
                <Show when={i() > 0}>
                  <ChevronRight class="size-3 shrink-0 text-fg-3/60" />
                </Show>
                <button
                  ref={el}
                  type="button"
                  title={c.full}
                  onClick={() => toggle(el, { dir: c.parent, mark: c.name })}
                  class={`${crumbClass(isOpen(() => el))} ${file() ? 'text-fg-2' : 'shrink-0'}`}
                >
                  <span ref={(s) => file() && (last = s)} class="truncate">
                    {c.name}
                  </span>
                </button>
              </Show>
            </>
          )
        }}
      </For>
      </nav>
      {props.after}
      <Show when={open()} keyed>
        {(o) => <FolderList open={o} nav={nav} current={props.path} machine={props.machine} onOpen={props.onOpen} onClose={() => setOpen()} />}
      </Show>
    </div>
  )
}

/** A floating list of a folder, to walk through and open a file from; or of the folders folded out of the bar. */
function FolderList(props: { open: Open; nav: HTMLElement; current: string; machine: string; onOpen?: (path: string) => void; onClose: () => void }) {
  const id = createUniqueId()
  const [dir, setDir] = createSignal('dir' in props.open ? props.open.dir : undefined)
  const [mark, setMark] = createSignal('dir' in props.open ? props.open.mark : undefined)
  const [filter, setFilter] = createSignal('')
  const [active, setActive] = createSignal(0)
  const place = floatBy(props.open.at, WIDTH)
  let panel!: HTMLDivElement
  let list!: HTMLDivElement

  const [listing] = createResource(
    () => dir(),
    (d) => api.listDir(d, false, props.machine).catch((e: Error): Listing & { error: string } => ({ path: d, parent: null, entries: [], truncated: false, error: e.message })),
  )
  const go = (to: string, from?: string) => {
    setFilter('')
    setMark(from)
    setDir(to)
  }

  type Row = { label: string; icon: (p: { class: string }) => JSX.Element; selected?: boolean; dim?: boolean; pick: () => void }
  const rows = createMemo((): Row[] => {
    const o = props.open
    if (!dir() && 'folded' in o)
      return o.folded.map((c) => ({ label: c.name, icon: Folder, pick: () => go(c.full) }))
    const l = listing.latest
    if (!l) return []
    const q = filter().toLowerCase()
    const entries = l.entries.filter((e) => !q || e.name.toLowerCase().includes(q))
    const up: Row[] = l.parent && !q ? [{ label: '..', icon: CornerLeftUp, dim: true, pick: () => go(l.parent!, l.path.split('/').pop()) }] : []
    return [
      ...up,
      ...entries.map((e: FileEntry): Row => {
        const full = join(l.path, e.name)
        return {
          label: e.name,
          icon: e.dir ? Folder : File,
          selected: full === props.current || e.name === mark(),
          pick: () => {
            if (e.dir) return go(full)
            props.onOpen?.(full)
            props.onClose()
          },
        }
      }),
    ]
  })

  // Lands on what was clicked, or the top match while filtering.
  createEffect(on([rows, filter], ([list, q]) => setActive(q ? 0 : Math.max(0, list.findIndex((r) => r.selected)))))
  // By offsets rather than scrollIntoView, which measures mid pop-in, while the panel is still scaled down.
  createEffect(
    on([active, rows], ([i]) => {
      const row = document.getElementById(`${id}-${i}`)
      if (!row) return
      if (row.offsetTop < list.scrollTop) list.scrollTop = row.offsetTop
      else if (row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = row.offsetTop + row.offsetHeight - list.clientHeight
    }),
  )
  createDismiss(() => true, () => [panel, props.nav], props.onClose, { resize: true })

  const close = () => {
    props.onClose()
    props.open.at.focus()
  }
  const onKey = (e: KeyboardEvent) => {
    const n = rows().length
    const keys: Record<string, () => void> = {
      ArrowDown: () => n && setActive((i) => (i + 1) % n),
      ArrowUp: () => n && setActive((i) => (i - 1 + n) % n),
      Enter: () => !e.isComposing && rows()[active()]?.pick(),
      Escape: close,
      Tab: close,
    }
    // On an empty filter, Backspace goes up a folder, as in the file browser.
    const up = listing.latest?.parent
    if (e.key === 'Backspace' && !filter() && dir() && up) keys.Backspace = () => go(up, listing.latest!.path.split('/').pop())
    const action = keys[e.key]
    if (!action) return
    if (e.key !== 'Tab') e.preventDefault()
    action()
  }

  return (
    <Portal>
      <div
        ref={panel}
        style={{ ...place, width: `${WIDTH}px` }}
        class="fixed z-40 flex animate-[pop-in_120ms_ease-out] flex-col rounded-xl border border-edge bg-bg text-ui pop shadow-(--shadow-pop)"
      >
        <input
          ref={(el) => queueMicrotask(() => el.focus())}
          value={filter()}
          onInput={(e) => setFilter(e.currentTarget.value)}
          onKeyDown={onKey}
          placeholder={dir() ? 'Filter' : 'Folded folders'}
          disabled={!dir()}
          role="combobox"
          aria-expanded="true"
          aria-controls={id}
          aria-activedescendant={rows().length ? `${id}-${active()}` : undefined}
          class="h-10 shrink-0 border-b border-line bg-transparent px-3.5 text-ui outline-none placeholder:text-fg-3 pointer-coarse:h-12 pointer-coarse:text-base"
        />
        <Show when={dir()}>
          <div class="shrink-0 truncate border-b border-line px-3.5 py-1.5 text-left font-mono text-meta text-fg-3 [direction:rtl]">{ltr(listing.latest?.path ?? dir()!)}</div>
        </Show>
        <div ref={list} id={id} role="listbox" class="relative min-h-0 overflow-y-auto p-1">
          <For
            each={rows()}
            fallback={
              <p class="px-2.5 py-2 text-fg-3">
                {listing.loading ? 'Reading…' : (listing.latest as { error?: string } | undefined)?.error ?? (filter() ? 'No matches' : 'Nothing here')}
              </p>
            }
          >
            {(r, i) => (
              <div
                id={`${id}-${i()}`}
                role="option"
                aria-selected={!!r.selected}
                onPointerMove={() => setActive(i())}
                // Keeps focus in the filter box.
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => r.pick()}
                class={`flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 pointer-coarse:py-2.5 ${active() === i() ? 'bg-surface' : ''}`}
              >
                <r.icon class="size-3.5 shrink-0 text-fg-3" />
                <span class={`min-w-0 flex-1 truncate ${r.dim ? 'text-fg-3' : r.selected ? 'font-medium text-fg' : 'text-fg-2'}`}>{r.label}</span>
              </div>
            )}
          </For>
          <Show when={dir() && listing.latest?.truncated}>
            <p class="px-2.5 py-1.5 text-meta text-fg-3">There’s more in it than is listed.</p>
          </Show>
        </div>
      </div>
    </Portal>
  )
}
