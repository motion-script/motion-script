import { createHighlighter, Highlighter } from "shiki";

/**
 * Shared Shiki highlighter wiring for the Code component.
 *
 * A single global highlighter is created lazily and incrementally loaded with
 * languages/themes as Code nodes request them, deduping concurrent loads. The
 * `globalHighlighter` instance stays private to this module; callers tokenize
 * through {@link highlightToTokens} and gate on {@link canHighlight}.
 */

let globalHighlighter: Highlighter | null = null;
let highlighterPromise: Promise<Highlighter> | null = null;
// In-flight per-language and per-theme loads on an existing highlighter, keyed
// by id, so concurrent Code nodes requesting the same language don't trigger a
// duplicate Shiki load.
const inFlightLangs = new Map<string, Promise<void>>();
const inFlightThemes = new Map<string, Promise<void>>();

export const DEFAULT_THEMES = ['github-dark'];
export const DEFAULT_LANGS = ['typescript', 'javascript', 'json', 'python'];

/** Has `lang` been loaded into the (existing) global highlighter? */
function isLanguageLoaded(lang: string): boolean {
    return !!globalHighlighter && globalHighlighter.getLoadedLanguages().includes(lang);
}

/** Has `theme` been loaded into the (existing) global highlighter? */
function isThemeLoaded(theme: string): boolean {
    return !!globalHighlighter && globalHighlighter.getLoadedThemes().includes(theme);
}

/**
 * Resolve a highlighter that has `themes` and `langs` loaded. Creates the global
 * highlighter on first call; on later calls it *incrementally* loads any missing
 * language/theme onto the existing highlighter (Shiki ignores constructor langs
 * once created), deduping concurrent loads. Resolves only once every requested
 * language and theme is available.
 */
export function ensureHighlighter(
    themes: string[] = DEFAULT_THEMES,
    langs: string[] = DEFAULT_LANGS,
): Promise<Highlighter> {
    if (!globalHighlighter) {
        if (!highlighterPromise) {
            highlighterPromise = createHighlighter({ themes, langs }).then(h => {
                globalHighlighter = h;
                return h;
            });
        }
        // The first creation may not include everything a later caller wants;
        // chain through ensureHighlighter again so missing langs/themes load.
        return highlighterPromise.then(() => ensureHighlighter(themes, langs));
    }

    const h = globalHighlighter;
    const jobs: Promise<void>[] = [];

    for (const lang of langs) {
        if (isLanguageLoaded(lang)) continue;
        let job = inFlightLangs.get(lang);
        if (!job) {
            job = h.loadLanguage(lang as any).finally(() => inFlightLangs.delete(lang));
            inFlightLangs.set(lang, job);
        }
        jobs.push(job);
    }

    for (const theme of themes) {
        if (isThemeLoaded(theme)) continue;
        let job = inFlightThemes.get(theme);
        if (!job) {
            job = h.loadTheme(theme as any).finally(() => inFlightThemes.delete(theme));
            inFlightThemes.set(theme, job);
        }
        jobs.push(job);
    }

    return jobs.length === 0 ? Promise.resolve(h) : Promise.all(jobs).then(() => h);
}

/**
 * Load a syntax-highlight language (and theme) into the shared highlighter.
 * Exposed so a Code node's asset loader can run it on the timeline, and so apps
 * can preload languages explicitly. Returns once the language is ready to use.
 */
export async function loadCodeLanguage(language: string, theme: string = DEFAULT_THEMES[0]): Promise<void> {
    await ensureHighlighter([theme], [language]);
}

export async function initSyntaxHighlighter(
    themes: string[] = DEFAULT_THEMES,
    langs: string[] = DEFAULT_LANGS,
) {
    globalHighlighter = await ensureHighlighter(themes, langs);
}

/** True once the highlighter can tokenize `language` with `theme` without throwing. */
export function canHighlight(language: string, theme: string): boolean {
    return isLanguageLoaded(language) && isThemeLoaded(theme);
}

/**
 * Tokenize `code` with the loaded highlighter. Callers must have checked
 * {@link canHighlight} first; this throws if the language/theme isn't loaded.
 */
export function highlightToTokens(
    code: string,
    language: string,
    theme: string,
): { content: string; color?: string }[][] {
    const result = globalHighlighter!.codeToTokens(code, { lang: language as any, theme: theme as any });
    return result.tokens.map(line => line.map(tok => ({ content: tok.content, color: tok.color })));
}
