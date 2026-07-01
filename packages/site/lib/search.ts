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

/**
 * A page and the entries under it that matched the query, ready to render as a
 * hierarchy: `page` is the page-level row (depth 1), `children` are its matching
 * subheadings. Groups are ordered by relevance; `score` is the group's best
 * (highest) entry score, used for that ordering.
 */
export interface SearchGroup {
  /** Page-level row for the group header. */
  page: SearchEntry
  /** Matching subheadings within the page, in document/rank order. */
  children: SearchEntry[]
  /** Section badge for the group (mirrors `page.section`). */
  section: SearchSection
  /** URL-derived category key the page lives under, e.g. "nodes" or "docs". */
  category: string
  /** Best entry score in the group; drives group ordering. */
  score: number
}

/**
 * A top-level section in the result hierarchy: all matching pages that share a
 * URL category (e.g. "Nodes", "Effects", "API"), with the pages as its groups.
 * This is the outer tier the dialog renders — section → page → subheading.
 */
export interface SearchSectionGroup {
  /** Category key the pages share, e.g. "nodes". Stable, lowercase. */
  category: string
  /** Human-readable category heading, e.g. "Nodes". */
  label: string
  /** "docs" | "api" — drives the section badge. */
  section: SearchSection
  /** Pages in this category that matched, ordered by relevance. */
  groups: SearchGroup[]
  /** Best group score in the section; drives section ordering. */
  score: number
}

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

interface ScoredEntry {
  entry: SearchEntry
  score: number
}

// Score every matching entry against the query. An entry matches only when every
// query token scores > 0 against its heading or title (AND semantics). Page-level
// (depth 1) entries get a relevance bump so a page whose title matches outranks a
// deep subheading that only contains the token as a substring.
function scoreEntries(query: string, entries: SearchIndex): ScoredEntry[] {
  const tokens = tokenize(query)
  if (tokens.length === 0) return []

  const scored: ScoredEntry[] = []

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
    if (entry.depth === 1) total += 30
    scored.push({ entry, score: total })
  }

  return scored
}

// The page key is the entry URL with any heading anchor stripped, so every
// subheading collapses onto its page.
function pageKey(entry: SearchEntry): string {
  const hash = entry.url.indexOf("#")
  return hash === -1 ? entry.url : entry.url.slice(0, hash)
}

// Derive the category an entry lives under from its URL. Pages are routed as
// `/<section>/<category>/<page>` (e.g. "/docs/nodes/rect" -> "nodes"); pages
// directly under the section (e.g. "/docs/intro") fall back to the section name
// itself so they still group somewhere sensible.
function categoryKey(entry: SearchEntry): string {
  const parts = pageKey(entry).split("/").filter(Boolean) // ["docs","nodes","rect"]
  return parts.length >= 3 ? parts[1] : entry.section
}

// Turn a category key into a display label: "image-filters" -> "Image filters",
// "api" -> "API". Hyphens become spaces and the first word is capitalized.
function categoryLabel(category: string): string {
  if (category === "api") return "API"
  const spaced = category.replace(/-/g, " ")
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

// Cap how many subheadings show under one page so a broad page-title match (which
// pulls in the whole page's TOC) doesn't flood the panel.
const MAX_CHILDREN_PER_GROUP = 5

/**
 * Rank `entries` against `query` and group the matches by page, producing a
 * two-level hierarchy: each page appears once as a header, with its matching
 * subheadings nested beneath it.
 *
 * A page is included if its title matched OR any of its subheadings matched.
 * When only a subheading matched, the page header is still synthesized (from the
 * page-level entry, or the subheading itself as a fallback) so every result has
 * a parent — that's what surfaces the page above its individual sections.
 *
 * Groups are ordered by their best entry score, but page-title matches are
 * always strong enough (via the depth-1 bump in scoring) to float their page to
 * the top. Within a group, children keep their document order. `limit` caps the
 * number of groups (pages), not individual rows.
 */
export function searchGroups(query: string, entries: SearchIndex, limit = 12): SearchGroup[] {
  const scored = scoreEntries(query, entries)
  if (scored.length === 0) return []

  // Bucket scored entries by page, preserving the page-level entry separately so
  // it always heads its group even if a subheading scored higher.
  const groups = new Map<
    string,
    { page: SearchEntry | null; children: ScoredEntry[]; best: number }
  >()

  for (const s of scored) {
    const key = pageKey(s.entry)
    let g = groups.get(key)
    if (!g) {
      g = { page: null, children: [], best: 0 }
      groups.set(key, g)
    }
    if (s.entry.depth === 1) g.page = s.entry
    else g.children.push(s)
    if (s.score > g.best) g.best = s.score
  }

  const result: SearchGroup[] = []
  for (const [, g] of groups) {
    // Synthesize a page header when only subheadings matched: prefer a real
    // depth-1 entry, otherwise derive one from the first child so the group still
    // has a clickable page row.
    const page =
      g.page ??
      (g.children.length > 0
        ? ({
            title: g.children[0].entry.title,
            heading: g.children[0].entry.title,
            url: pageKey(g.children[0].entry),
            section: g.children[0].entry.section,
            depth: 1,
          } satisfies SearchEntry)
        : null)
    if (!page) continue
    g.children.sort((a, b) => b.score - a.score)
    result.push({
      page,
      children: g.children.slice(0, MAX_CHILDREN_PER_GROUP).map((c) => c.entry),
      section: page.section,
      category: categoryKey(page),
      score: g.best,
    })
  }

  result.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return a.page.title.localeCompare(b.page.title)
  })

  return result.slice(0, limit)
}

/**
 * Group ranked results into the full three-tier hierarchy the dialog renders:
 * section (URL category, e.g. "Nodes") → page → subheading. Built on top of
 * {@link searchGroups}, so page/subheading ranking and the page-title bump carry
 * through; sections are then ordered by their best-scoring page and the pages
 * within keep their relevance order. `limit` bounds the total page count.
 */
export function searchSections(
  query: string,
  entries: SearchIndex,
  limit = 12,
): SearchSectionGroup[] {
  const pages = searchGroups(query, entries, limit)
  if (pages.length === 0) return []

  const byCategory = new Map<string, SearchSectionGroup>()
  for (const group of pages) {
    let section = byCategory.get(group.category)
    if (!section) {
      section = {
        category: group.category,
        label: categoryLabel(group.category),
        section: group.section,
        groups: [],
        score: 0,
      }
      byCategory.set(group.category, section)
    }
    section.groups.push(group)
    if (group.score > section.score) section.score = group.score
  }

  return [...byCategory.values()].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return a.label.localeCompare(b.label)
  })
}
