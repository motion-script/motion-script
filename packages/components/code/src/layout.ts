import type { InsetsResolved, Measurer, RenderContext2D } from "@motion-script/core";
import type { TokenAdvanceCache } from "./measure-cache";
import type { IdLine } from "./tokens";

/**
 * Everything about a listing's geometry that is *not* its content — the type,
 * the padding, whether there is a gutter. Split out from the node so a layout
 * can be computed for a token structure the node is no longer holding: during a
 * structural transition the frame is the interpolation of two of them, and the
 * one that is going away is not reachable through `this` any more.
 */
export interface CodeMetrics {
    fontSize: number;
    fontFamily: string;
    lineHeight: number;
    letterSpacing: number;
    padding: InsetsResolved;
    showLineNumbers: boolean;
    lineNumberGap: number;
}

/** Where one token sits: its LEFT edge, and the vertical CENTRE of its line's slot. */
export interface TokenBox {
    x: number;
    y: number;
}

/**
 * A resolved listing geometry: every token placed, in the node's own space
 * (origin at the block's centre, y-up).
 *
 * Positions are absolute rather than "a running sum plus a width scale", which
 * is the whole point. A token's place in the *next* structure is knowable
 * without drawing it, so a transition can move a token from where it was to
 * where it will be instead of faking the motion by collapsing the advance of
 * its neighbours — which is what made an insert look like a pile of glyphs at
 * the left margin springing apart.
 */
export interface CodeLayout {
    /** Token id → placement. */
    tokens: Map<number, TokenBox>;
    /** Vertical centre of each line's slot, by line index. */
    lineY: number[];
    /** Line id → its index in this structure (i.e. its line *number* minus one). */
    lineIndex: Map<number, number>;
    gutter: number;
    gutterGap: number;
    /** Content size, no padding. */
    innerW: number;
    innerH: number;
    /** Content size plus padding — what the block draws and measures as. */
    blockW: number;
    blockH: number;
    /** Left edge of the code column (after padding and gutter). */
    startX: number;
}

/**
 * Signature of everything a layout depends on other than the token structure
 * itself. A cached layout survives exactly as long as this is unchanged.
 */
export function metricsSignature(m: CodeMetrics): string {
    const p = m.padding;
    return [
        m.fontSize, m.fontFamily, m.lineHeight, m.letterSpacing,
        p.left, p.right, p.top, p.bottom,
        m.showLineNumbers ? 1 : 0, m.lineNumberGap,
    ].join("|");
}

/**
 * Horizontal gap between the line-number column and the code text. Sized in
 * space-widths so it scales with the font, and measured with letterSpacing 0 —
 * line numbers and the gap don't carry the code's letter-spacing.
 */
function gutterGapOf(scope: Measurer | RenderContext2D, m: CodeMetrics, cache: TokenAdvanceCache): number {
    return cache.advance(scope, " ", m.fontSize, m.fontFamily, 0) * m.lineNumberGap;
}

/** Width of the line-number column for a structure of `lineCount` lines, gap included. */
function gutterOf(
    scope: Measurer | RenderContext2D,
    m: CodeMetrics,
    cache: TokenAdvanceCache,
    lineCount: number,
    gap: number,
): number {
    if (!m.showLineNumbers) return 0;
    const sample = String(Math.max(1, lineCount));
    return cache.advance(scope, sample, m.fontSize, m.fontFamily, 0) + gap;
}

/**
 * Place every token of `lines`.
 *
 * Pure in (lines, metrics, font measurements), which is what lets a caller cache
 * one per structure rather than recomputing it per frame — a transition's two
 * endpoints are both fixed for its whole duration.
 */
export function layoutCode(
    lines: IdLine[],
    m: CodeMetrics,
    cache: TokenAdvanceCache,
    scope: Measurer | RenderContext2D,
): CodeLayout {
    const lineH = m.fontSize * m.lineHeight;
    const gutterGap = m.showLineNumbers ? gutterGapOf(scope, m, cache) : 0;
    const gutter = gutterOf(scope, m, cache, lines.length, gutterGap);

    const widths: number[] = new Array(lines.length);
    let maxLineWidth = 0;
    for (let i = 0; i < lines.length; i++) {
        let w = 0;
        for (const tok of lines[i].tokens) {
            w += cache.advance(scope, tok.content, m.fontSize, m.fontFamily, m.letterSpacing);
        }
        widths[i] = w;
        if (w > maxLineWidth) maxLineWidth = w;
    }

    const innerW = maxLineWidth + gutter;
    const innerH = lines.length * lineH;
    const blockW = innerW + m.padding.left + m.padding.right;
    const blockH = innerH + m.padding.top + m.padding.bottom;
    const startX = -blockW / 2 + m.padding.left + gutter;
    // y-up author space: the first line sits at the TOP of the block, so the
    // cursor starts at the top edge (+half height, minus top padding) and steps
    // DOWNWARD by subtracting a line height per row.
    const startY = blockH / 2 - m.padding.top;

    const tokens = new Map<number, TokenBox>();
    const lineY: number[] = new Array(lines.length);
    const lineIndex = new Map<number, number>();

    for (let i = 0; i < lines.length; i++) {
        const centerY = startY - i * lineH - lineH / 2;
        lineY[i] = centerY;
        lineIndex.set(lines[i].id, i);
        let x = startX;
        for (const tok of lines[i].tokens) {
            tokens.set(tok.id, { x, y: centerY });
            x += cache.advance(scope, tok.content, m.fontSize, m.fontFamily, m.letterSpacing);
        }
    }

    return { tokens, lineY, lineIndex, gutter, gutterGap, innerW, innerH, blockW, blockH, startX };
}
