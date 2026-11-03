import { createHighlighterCore, createCssVariablesTheme } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import type { Tokens } from './highlight.ts'
import { bundledLanguages, bundledLanguagesAlias } from 'shiki/langs'

/*
 * Shiki, kept out of the main bundle: src/highlight.ts loads this once the
 * page is idle. Colours come from the palette as --code-token-* variables
 * (see index.css), so code follows the theme.
 */

const theme = createCssVariablesTheme({ name: 'badger', variablePrefix: '--code-', fontStyle: true })

const highlighter = await createHighlighterCore({ themes: [theme], langs: [], engine: createJavaScriptRegexEngine({ forgiving: true }) })

type Grammar = () => Promise<{ default: Parameters<typeof highlighter.loadLanguage>[0] }>
const grammars: Record<string, Grammar> = { ...bundledLanguages, ...bundledLanguagesAlias } as never
const loading = new Map<string, Promise<void>>()

/** Whether the language is one Shiki knows, with its grammar loaded. */
async function loaded(lang: string): Promise<boolean> {
  if (!grammars[lang]) return false
  if (!loading.has(lang)) loading.set(lang, grammars[lang]().then((m) => highlighter.loadLanguage(m.default)))
  await loading.get(lang)
  return true
}

/** Code as HTML: spans for its tokens and a <br> between lines, or undefined for a language Shiki doesn't know. */
export async function toHtml(code: string, lang: string): Promise<string | undefined> {
  if (!(await loaded(lang))) return
  return highlighter.codeToHtml(code, { lang, theme: 'badger', structure: 'inline' })
}

/** Code as its lines' tokens, each its length and style, or undefined for a language Shiki doesn't know. */
export async function toTokens(code: string, lang: string): Promise<Tokens | undefined> {
  if (!(await loaded(lang))) return
  return highlighter.codeToTokens(code, { lang, theme: 'badger' }).tokens.map((line) =>
    line.map((t) => {
      // The text's own colour needs no style of its own.
      const style = [t.color && t.color !== 'var(--code-foreground)' && `color: ${t.color}`, (t.fontStyle ?? 0) & 1 && 'font-style: italic', (t.fontStyle ?? 0) & 2 && 'font-weight: 600']
      return { length: t.content.length, style: style.filter(Boolean).join('; ') }
    }),
  )
}
