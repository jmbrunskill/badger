import { createEffect, createMemo, createRoot, createSignal, untrack } from 'solid-js'
import type { SessionSummary, StartAt } from '../shared/protocol.ts'
import { socket } from './api.ts'
import { isScratch, scratchDir } from './folders.ts'
import { LOCAL, machineOf, machines } from './machines.ts'
import { cardOf, linkSession } from './stores/cards.ts'
import { config } from './stores/config.ts'
import { sessionById, sessions, sessionsLoaded } from './stores/sessions.ts'

/**
 * New chats: ones with an id but no first message yet, which the hub knows only by their drafts. Home has one, and
 * each card can too, which "New chat" there goes back to while nothing's typed in it. Once something is, it's a
 * draft, listed with the chats, and the next "New chat" there is a fresh one. Where each will run is kept with its
 * draft once it's picked or typed in; until then it's the defaults here.
 */

const FRESH_KEY = 'badger.newChats'
const LAST_MACHINE_KEY = 'badger.lastMachine'

/** crypto.randomUUID needs a secure context; fall back for plain-http hosts. */
function uuid(): string {
  if (crypto.randomUUID) return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** Each place's new chat, by its card's id or 'home', from this browser's last visit. */
function loadFresh(): Record<string, string> {
  try {
    const saved = JSON.parse(localStorage.getItem(FRESH_KEY) ?? 'null')
    if (saved) return saved
    // From before drafts kept where they run: home's and the cards' new chats carry over; where each was to run doesn't.
    const fresh = { ...JSON.parse(localStorage.getItem('badger.blankChats') ?? '{}'), home: localStorage.getItem('badger.homeId') ?? uuid() }
    for (const old of ['badger.blankChats', 'badger.homeId', 'badger.draftCwds', 'badger.draftMachines', 'badger.draftWorktrees']) localStorage.removeItem(old)
    return fresh
  } catch {
    return { home: uuid() }
  }
}

const [fresh, setFresh] = createSignal<Record<string, string>>(loadFresh())
/** The runner this browser last picked for a chat, which new ones default to while it's online. */
const [lastMachine, setLastMachine] = createSignal(localStorage.getItem(LAST_MACHINE_KEY) ?? undefined)
/** Where each new chat with nothing saved will run, settled the first time it's asked, so it doesn't move while it waits. */
const pinned = new Map<string, StartAt>()

/** The new chat home shows. */
export const homeId = () => fresh().home

/** The most recent chat a new one could start where it ran: temp dirs and ones that are gone (removed worktrees) don't count. */
const TEMP = /^\/(private\/)?(tmp|var\/folders)\//
const latestChat = (machine?: string) =>
  sessions()
    .filter((s) => s.cwd && !s.unstarted && !s.gone && (isScratch(s.cwd) || !TEMP.test(s.cwd)) && (!machine || (s.machine || LOCAL) === machine))
    .reduce<SessionSummary | undefined>((a, s) => (!a || s.lastModified > a.lastModified ? s : a), undefined)

const { defaultMachine, defaultCwd } = createRoot(() => {
  /** New chats run on the runner this browser last picked while it's online, else where the most recently active chat ran if that's online. */
  const defaultMachine = createMemo(() => {
    const online = (m?: string) => !!m && !!machineOf(m)?.online
    const picked = lastMachine()
    const latest = latestChat()?.machine
    return online(picked) ? picked! : online(latest) ? latest! : LOCAL
  })
  /** And start where that runner's most recently active chat ran, or with no folder there. */
  const defaultCwd = createMemo(() => {
    const m = defaultMachine()
    return latestChat(m)?.cwd ?? scratchDir(m) ?? (m === LOCAL ? config()?.defaultCwd : machineOf(m)?.workspaceDir)
  })

  createEffect(() => localStorage.setItem(FRESH_KEY, JSON.stringify(fresh())))
  createEffect(() => lastMachine() && localStorage.setItem(LAST_MACHINE_KEY, lastMachine()!))
  // New chats that have started, here or in another tab, make way for fresh ones.
  createEffect(() => {
    const started = new Set(sessions().flatMap((s) => (s.unstarted ? [] : [s.id])))
    for (const id of Object.values(untrack(fresh))) if (started.has(id)) chatStarted(id)
  })

  return { defaultMachine, defaultCwd }
})

/**
 * Where a new chat runs if nothing's saved with its draft: the defaults, as they were the first time it was asked.
 * Undefined until they're known: the runners, so the one last picked isn't passed over for seeming offline, and a
 * runner that's only just connected may not have said where its folders are yet.
 */
export function defaultStart(id: string): StartAt | undefined {
  const at = pinned.get(id)
  if (at) return at
  if (!sessionsLoaded() || !machines().length) return undefined
  const cwd = defaultCwd()
  if (!cwd) return undefined
  const start = { machine: untrack(defaultMachine), cwd }
  pinned.set(id, start)
  return start
}

/** The user picked a runner for a chat: new ones default to it from now on. */
export const rememberMachine = (machine: string) => setLastMachine(machine)

/**
 * A new chat on a card, or home's: the one there if nothing's typed in it, else a fresh one, starting `from` where
 * given. A card's goes on the card.
 */
export function newChat(card?: number, from?: StartAt): string {
  const place = card ?? 'home'
  const kept = untrack(fresh)[place]
  // A new chat with something typed is listed: it's a draft now, and stays as it is. Until the list is in, that
  // can't be known. A card's that was discarded has come off the card.
  if (kept && sessionsLoaded() && !sessionById(kept) && (card === undefined || cardOf(kept)?.id === card)) {
    // What it has saved comes first; this is for when it has nothing, e.g. after a week left untouched.
    if (from && !pinned.has(kept)) pinned.set(kept, from)
    return kept
  }
  const id = uuid()
  setFresh((f) => ({ ...f, [place]: id }))
  if (from) {
    pinned.set(id, from)
    // Kept with its draft, so it's still there after a reload, or in another tab.
    socket.send({ type: 'draft', sessionId: id, start: from })
  }
  if (card !== undefined) void linkSession(card, id)
  return id
}

/** A new chat's first message went out, so wherever it was the new chat, there's a fresh one. */
export function chatStarted(id: string) {
  pinned.delete(id)
  setFresh((f) => {
    const left = Object.fromEntries(Object.entries(f).filter(([, kept]) => kept !== id))
    return { ...left, home: left.home ?? uuid() }
  })
}
