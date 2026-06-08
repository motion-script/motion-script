import { canHighlight, highlightToTokens } from "./highlight";

// IdToken is our internal wrapper around shiki's ThemedToken that gives every
// token a stable identity across line insertions/removals. All animation state
// is keyed by `id`, so concurrent edits at different positions don't clobber
// each other while one is mid-animation.
export interface IdToken {
    id: number;
    content: string;
    color?: string;
}

// IdLine wraps a row of tokens with its own stable id, so per-line animations
// (heightScale during insert/remove) survive line insertions/removals.
export interface IdLine {
    id: number;
    tokens: IdToken[];
}

// Module-global, monotonic id counters shared across all Code nodes — ids only
// need to be unique within a node, but a global counter is the simplest way to
// guarantee that and never collides.
let nextTokenId = 1;
let nextLineId = 1;

export function makeIdToken(content: string, color?: string): IdToken {
    return { id: nextTokenId++, content, color };
}

export function makeIdLine(tokens: IdToken[]): IdLine {
    return { id: nextLineId++, tokens };
}

export function tokenizeCodeToIdLines(code: string, language: string, theme: string): IdLine[] {
    // Until the language+theme have loaded (they stream in via the asset loader),
    // fall back to flat, uncolored lines instead of letting Shiki throw
    // "Language `x` not found". The node re-tokenizes once the load completes.
    if (!canHighlight(language, theme)) {
        return code.split('\n').map(line => makeIdLine([makeIdToken(line, '#d1d5db')]));
    }
    return highlightToTokens(code, language, theme).map(line =>
        makeIdLine(line.map(tok => makeIdToken(tok.content, tok.color))),
    );
}

/**
 * Split `tokens` at character offset `col` (relative to the joined content of
 * the tokens). If `col` falls inside a token, that token is split into two new
 * tokens with fresh ids (the original id is discarded — it didn't exist as a
 * single unit on either side of the cut).
 */
export function splitTokensAt(
    tokens: IdToken[],
    col: number,
): { before: IdToken[]; after: IdToken[] } {
    const before: IdToken[] = [];
    const after: IdToken[] = [];
    let off = 0;
    for (const tok of tokens) {
        const tStart = off;
        const tEnd = off + tok.content.length;
        if (tEnd <= col) {
            before.push(tok);
        } else if (tStart >= col) {
            after.push(tok);
        } else {
            const cut = col - tStart;
            before.push(makeIdToken(tok.content.slice(0, cut), tok.color));
            after.push(makeIdToken(tok.content.slice(cut), tok.color));
        }
        off = tEnd;
    }
    return { before, after };
}
