import { createSignal } from 'solid-js'
import type { BranchChoices } from '../../shared/protocol.ts'
import { api } from '../api.ts'
import { basename, worktreeOf } from '../folders.ts'
import { touchBase } from './BasePicker.tsx'
import { showError } from './Popover.tsx'
import { SearchMenu, type SearchItem } from './ui.tsx'

/** How many branches show before any are looked for, most recently committed first. */
const RECENT = 15

/**
 * Switches the checkout to another branch, or a new one from here. Git does it as it is: it refuses
 * rather than lose uncommitted changes, and what it says is shown.
 */
export function BranchPicker(props: {
  dir: string
  machine: string
  /** As SearchMenu takes them: opened from elsewhere, where that was. */
  anchor: () => HTMLElement
  opener: (show: () => void) => void
}) {
  const [choices, setChoices] = createSignal<BranchChoices>()
  const go = (to: string, create = false) =>
    void api.switchBranch(props.dir, to, create, props.machine).then(
      // A branch of its own has a base of its own: what reads one reads it again, the bar above the chat and the diff.
      touchBase,
      (e: Error) => showError(`Couldn't switch to ${to}`, e.message, props.anchor()),
    )

  const items = (q: string): SearchItem[] => {
    const c = choices()
    if (!c) return [{ label: 'Reading branches…', pick: () => {} }]
    const needle = q.trim().toLowerCase()
    const found = c.branches.filter((b) => !needle || b.name.toLowerCase().includes(needle))
    // Every branch only when looked for: there can be hundreds.
    const list: SearchItem[] = found.slice(0, needle ? 50 : RECENT).map((b) => ({
      label: b.name,
      selected: b.name === c.branch,
      // By its worktree's name, or its folder's for any other checkout: whole paths never fit.
      // One out elsewhere is switched to detached: git won't have it out in two checkouts.
      ...(b.elsewhere ? { hint: `in ${worktreeOf(b.elsewhere)?.name ?? basename(b.elsewhere)}, detached` } : b.remote ? { hint: 'remote' } : {}),
      pick: () => b.name !== c.branch && go(b.name),
    }))
    const name = q.trim()
    if (name && !c.branches.some((b) => b.name === name))
      list.push({ label: `Create ${name}`, description: c.branch ? `From ${c.branch}, and switch to it` : 'From here, and switch to it', pick: () => go(name, true) })
    return list
  }

  return (
    <SearchMenu
      items={items}
      placeholder="Find or name a branch"
      empty="No branch by that name"
      width={320}
      anchor={props.anchor}
      opener={props.opener}
      onOpenChange={(open) => {
        if (!open) return
        setChoices(undefined)
        api.branches(props.dir, props.machine).then(setChoices, (e: Error) => showError("Couldn't read the branches", e.message))
      }}
    />
  )
}
