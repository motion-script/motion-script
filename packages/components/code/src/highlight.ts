import { Parser, Tree } from "@lezer/common";
import { highlightTree } from "@lezer/highlight";
import {
    BUILTIN_THEMES,
    CodeHighlightStyle,
    CodeTheme,
    DefaultHighlightStyle,
    compileStyle,
} from "./style";

/**
 * Lezer-backed syntax highlighting for the Code component, replacing the former
 * Shiki wiring. This mirrors Motion Canvas's `LezerHighlighter`:
 *
 *  - {@link prepareHighlight} parses code once and builds a `from:to` → color map
 *    by walking {@link highlightTree}.
 *  - {@link tokenizeCode} splits code at parse-tree leaf boundaries.
 *  - {@link highlightAt} resolves the color (and run length) for a character index.
 *
 * Parsers load lazily and asynchronously (dynamic import) so the bundle doesn't
 * pull in every grammar. The node's asset loader awaits {@link ensureHighlighter}
 * before tokenizing; until a parser resolves, callers fall back to plain text and
 * re-tokenize once {@link canHighlight} returns true.
 */

/** Dynamic-import factories for each supported language → a Lezer {@link Parser}. */
const LANGUAGE_LOADERS: Record<string, () => Promise<Parser>> = {
    typescript: async () => (await import("@lezer/javascript")).parser.configure({ dialect: "ts" }),
    tsx: async () => (await import("@lezer/javascript")).parser.configure({ dialect: "ts jsx" }),
    javascript: async () => (await import("@lezer/javascript")).parser,
    jsx: async () => (await import("@lezer/javascript")).parser.configure({ dialect: "jsx" }),
    python: async () => (await import("@lezer/python")).parser,
    json: async () => (await import("@lezer/json")).parser,
    html: async () => (await import("@lezer/html")).parser,
    css: async () => (await import("@lezer/css")).parser,
    rust: async () => (await import("@lezer/rust")).parser,
    go: async () => (await import("@lezer/go")).parser,
    java: async () => (await import("@lezer/java")).parser,
    cpp: async () => (await import("@lezer/cpp")).parser,
    php: async () => (await import("@lezer/php")).parser,
    markdown: async () => (await import("@lezer/markdown")).parser,
    xml: async () => (await import("@lezer/xml")).parser,
    yaml: async () => (await import("@lezer/yaml")).parser,
};

// Aliases so common language strings resolve to a loader above.
const LANGUAGE_ALIASES: Record<string, string> = {
    ts: "typescript",
    js: "javascript",
    py: "python",
    "c++": "cpp",
    md: "markdown",
    yml: "yaml",
    shell: "javascript", // no shell grammar bundled; fall back rather than throw
};

function resolveLanguageKey(language: string): string {
    const key = language.toLowerCase();
    return LANGUAGE_ALIASES[key] ?? key;
}

// Loaded parsers and in-flight loads, keyed by resolved language key, so
// concurrent Code nodes asking for the same language share one dynamic import.
const loadedParsers = new Map<string, Parser>();
const inFlightLangs = new Map<string, Promise<Parser | null>>();

export const DEFAULT_THEMES = [DefaultHighlightStyle.name];
export const DEFAULT_LANGS = ["typescript", "javascript", "json", "python"];

// Theme registry, seeded with the built-ins (Motion Canvas default + GitHub
// dark/light). The `theme` prop is a string name or a CodeHighlightStyle object;
// apps can register additional styles by name and reference them by that name.
const themesByName = new Map<string, CodeHighlightStyle>(Object.entries(BUILTIN_THEMES));

/** Register a custom {@link CodeHighlightStyle} so Code nodes can reference it by name. */
export function registerCodeTheme(style: CodeHighlightStyle): void {
    themesByName.set(style.name, style);
}

/**
 * Resolve a theme reference (a registered name, or a CodeHighlightStyle object)
 * to a concrete style. Unknown names fall back to the Motion Canvas default so a
 * stray theme string never throws.
 */
export function resolveTheme(theme: CodeTheme): CodeHighlightStyle {
    if (typeof theme !== "string") return theme;
    return themesByName.get(theme) ?? DefaultHighlightStyle;
}

/** Has `language` finished loading its parser? */
function isLanguageLoaded(language: string): boolean {
    return loadedParsers.has(resolveLanguageKey(language));
}

/**
 * Load the parsers for `langs` (themes are synchronous, so they're a no-op here
 * but kept in the signature for API parity with the former Shiki implementation).
 * Resolves once every requested language's parser is available. Unknown languages
 * resolve without loading anything — {@link canHighlight} stays false for them and
 * the node renders them as plain text.
 */
export function ensureHighlighter(
    _themes: string[] = DEFAULT_THEMES,
    langs: string[] = DEFAULT_LANGS,
): Promise<void> {
    const jobs: Promise<unknown>[] = [];

    for (const lang of langs) {
        const key = resolveLanguageKey(lang);
        if (loadedParsers.has(key)) continue;

        const loader = LANGUAGE_LOADERS[key];
        if (!loader) continue; // unsupported language; leave it unhighlighted

        let job = inFlightLangs.get(key);
        if (!job) {
            job = loader()
                .then(parser => {
                    loadedParsers.set(key, parser);
                    return parser;
                })
                .catch(() => null)
                .finally(() => inFlightLangs.delete(key));
            inFlightLangs.set(key, job);
        }
        jobs.push(job);
    }

    return jobs.length === 0 ? Promise.resolve() : Promise.all(jobs).then(() => undefined);
}

/**
 * Load a syntax-highlight language into the shared highlighter. Exposed so a Code
 * node's asset loader can run it on the timeline, and so apps can preload
 * languages explicitly. Returns once the parser is ready (or immediately for an
 * unsupported language). The `theme` arg is accepted for backwards compatibility.
 */
export async function loadCodeLanguage(language: string, _theme?: string): Promise<void> {
    await ensureHighlighter(DEFAULT_THEMES, [language]);
}

export async function initSyntaxHighlighter(
    themes: string[] = DEFAULT_THEMES,
    langs: string[] = DEFAULT_LANGS,
): Promise<void> {
    await ensureHighlighter(themes, langs);
}

/** True once `language` can be tokenized (its parser has loaded). */
export function canHighlight(language: string, _theme?: CodeTheme): boolean {
    return isLanguageLoaded(language);
}

/** A parsed-and-prepared highlight cache for one snapshot of code. */
interface HighlightCache {
    tree: Tree;
    code: string;
    // `${from}:${to}` node id → color, exactly as Motion Canvas keys it.
    colorLookup: Map<string, string>;
}

function nodeId(from: number, to: number): string {
    return `${from}:${to}`;
}

/**
 * Parse `code` and build the per-node color map. Mirrors Motion Canvas's
 * `LezerHighlighter.prepare`: for each highlighted range, walk the subtree and
 * record the color against every contained node's `from:to` id, so a later
 * {@link highlightAt} lookup by `resolveInner` index finds it.
 */
function prepareHighlight(code: string, language: string, style: CodeHighlightStyle): HighlightCache | null {
    const parser = loadedParsers.get(resolveLanguageKey(language));
    if (!parser) return null;

    const tree = parser.parse(code);
    const highlighter = compileStyle(style);
    const colorLookup = new Map<string, string>();

    highlightTree(tree, highlighter, (from, to, classes) => {
        // tagHighlighter emits our color string as the "class".
        const color = classes;
        if (!color) return;
        const cursor = tree.cursorAt(from, 1);
        do {
            colorLookup.set(nodeId(cursor.from, cursor.to), color);
        } while (cursor.next() && cursor.to <= to);
    });

    return { tree, code, colorLookup };
}

/**
 * Resolve the color and run length for the token starting at `index`. Mirrors
 * Motion Canvas's `LezerHighlighter.highlight`: resolve the innermost node, look
 * up its color, and report how far the run extends (`skipAhead`).
 */
function highlightAt(index: number, cache: HighlightCache): { color: string | null; skipAhead: number } {
    const node = cache.tree.resolveInner(index, 1);
    const color = cache.colorLookup.get(nodeId(node.from, node.to));
    if (color) {
        return { color, skipAhead: node.to - index };
    }
    // No color: skip past a childless (leaf) node so we don't re-resolve every char.
    const skipAhead = node.firstChild ? 0 : node.to - index;
    return { color: null, skipAhead };
}

/**
 * Split `code` into structural tokens at parse-tree leaf boundaries, including the
 * gaps between leaves (whitespace/punctuation). Mirrors Motion Canvas's
 * `LezerHighlighter.tokenize`; this segmentation is what the token-level
 * append/insert/erase/replace animations diff against, so matching it keeps the
 * animation behavior identical to Motion Canvas.
 */
function tokenizeCode(code: string, language: string): string[] {
    const parser = loadedParsers.get(resolveLanguageKey(language));
    if (!parser) return [code];

    const tree = parser.parse(code);
    const cursor = tree.cursor();
    const tokens: string[] = [];
    let current = 0;

    do {
        if (!cursor.node.firstChild) {
            if (cursor.from > current) tokens.push(code.slice(current, cursor.from));
            if (cursor.from < cursor.to) tokens.push(code.slice(cursor.from, cursor.to));
            current = cursor.to;
        }
    } while (cursor.next());

    if (current < code.length) tokens.push(code.slice(current));
    return tokens;
}

/**
 * Tokenize `code` into per-line, colored tokens — the contract the rest of the
 * Code component consumes. Combines {@link tokenizeCode} (structural split) with
 * {@link highlightAt} (per-run color), then breaks tokens at newlines so each
 * output line is a row of single-line, single-color tokens.
 *
 * Callers must have checked {@link canHighlight} first; this returns a single
 * uncolored line per source line if the parser isn't loaded.
 */
export function highlightToTokens(
    code: string,
    language: string,
    theme: CodeTheme = DefaultHighlightStyle,
): { content: string; color?: string }[][] {
    const style = resolveTheme(theme);
    const cache = prepareHighlight(code, language, style);

    const lines: { content: string; color?: string }[][] = [[]];
    const pushLine = () => lines.push([]);

    if (!cache) {
        // Parser unavailable: one uncolored token per source line.
        return code.split("\n").map(line => [{ content: line, color: style.defaultColor }]);
    }

    // Walk the structural tokens, coloring each by its starting index and
    // splitting on newlines so no token spans rows.
    let index = 0;
    for (const token of tokenizeCode(code, language)) {
        let offset = 0;
        while (offset < token.length) {
            const { color, skipAhead } = highlightAt(index + offset, cache);
            // Extend the run as far as the highlight says, but never past this
            // structural token and never across a newline (lines are drawn rows).
            let runEnd = offset + Math.max(skipAhead, 1);
            if (runEnd > token.length) runEnd = token.length;
            const newlineRel = token.indexOf("\n", offset);
            if (newlineRel !== -1 && newlineRel < runEnd) runEnd = newlineRel;

            const slice = token.slice(offset, runEnd);
            if (slice.length > 0) {
                lines[lines.length - 1].push({ content: slice, color: color ?? style.defaultColor });
            }

            if (newlineRel === runEnd) {
                pushLine();
                runEnd += 1; // consume the newline itself
            }
            offset = runEnd;
        }
        index += token.length;
    }

    return lines;
}
