// Client-safe search types and matcher. This module must NOT import `fs` or any
// other Node-only API: it is bundled into the client `SearchDialog`. The index
// it operates on is produced at build time by `lib/build-search-index.ts` and
// shipped as the static asset `public/search-index.json`.

export type SearchSection = "docs" | "api"

export interface SearchEntry {
  /** Page title (frontmatter title or first H1). Used as the result's page label. */
  title: string
  /** Heading text. Equals `title` for the page-level (depth 1) entry. */
  heading: string
  /** Full URL including the heading anchor, e.g. "/docs/nodes/rect#usage". */
  url: string
  /** "docs" | "api" — drives the section badge and result grouping. */
  section: SearchSection
  /** 1 = page title entry, 2/3 = h2/h3 subheading. Drives ranking + indentation. */
  depth: 1 | 2 | 3
}

export type SearchIndex = SearchEntry[]

// Split a query into lowercased, non-empty tokens. Every token must match for an
// entry to be a hit (AND semantics), which keeps multi-word queries precise.
function tokenize(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean)
}

// Score a single token against an entry. Returns 0 when the token is absent, so
// callers can require every token to contribute. Higher is better; heading
// matches always beat title-only matches so heading-keyed results rank first.
function scoreToken(token: string, heading: string, title: string): number {
  const h = heading.toLowerCase()
  const t = title.toLowerCase()

  if (h === token) return 100 // exact heading match
  if (h.startsWith(token)) return 60 // heading prefix
  // Word-boundary match inside the heading (e.g. "default" in "Size defaults").
  if (new RegExp(`\\b${escapeRegExp(token)}`).test(h)) return 40
  if (h.includes(token)) return 25 // heading substring
  if (t.includes(token)) return 10 // title-only fallback
  return 0
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Rank `entries` against `query`. An entry matches only when every query token
 * scores > 0 against its heading or title. Results are sorted by total score
 * (desc), then by depth (page titles / h2 above h3), then alphabetically for a
 * stable order, and capped at `limit`.
 */
export function searchEntries(query: string, entries: SearchIndex, limit = 20): SearchEntry[] {
  const tokens = tokenize(query)
  if (tokens.length === 0) return []

  const scored: { entry: SearchEntry; score: number }[] = []

  for (const entry of entries) {
    let total = 0
    let matchedAll = true
    for (const token of tokens) {
      const s = scoreToken(token, entry.heading, entry.title)
      if (s === 0) {
        matchedAll = false
        break
      }
      total += s
    }
    if (!matchedAll) continue
    // Nudge page-level entries up a touch so a page whose title matches outranks
    // a deep h3 that only contains the token as a substring.
    if (entry.depth === 1) total += 5
    scored.push({ entry, score: total })
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (a.entry.depth !== b.entry.depth) return a.entry.depth - b.entry.depth
    return a.entry.heading.localeCompare(b.entry.heading)
  })

  return scored.slice(0, limit).map((s) => s.entry)
}
