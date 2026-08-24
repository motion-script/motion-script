import { RenderContext2D, Graphics2D, NormalizedColor, parseColor, lerpNumber } from "@motion-script/core";
import type { CodeLayout, CodeMetrics } from "./layout";
import type { IdLine } from "./tokens";
import { easeOutCubic, windowProgress, moveProgress } from "./transitions";
import type { TokenState, EntryDirection, StructuralTransition } from "./transitions";
import type { TokenAdvanceCache } from "./measure-cache";

/** Colour of a token the grammar had no opinion about. */
const DEFAULT_TOKEN_COLOR: NormalizedColor = [0.82, 0.84, 0.86, 1];
/** Gutter line-number colour: a muted version of the standard text colour. */
const LINE_NUMBER_COLOR: NormalizedColor = [0.45, 0.5, 0.55, 1];

// `parseColor` walks a CSS string; a listing asks for the same handful of theme
// colours on every token of every frame, so the parse is memoized. Module-level,
// because the answer depends only on the string.
const colorCache = new Map<string, NormalizedColor>();
function tokenColor(css: string | undefined): NormalizedColor {
    if (!css) return DEFAULT_TOKEN_COLOR;
    let hit = colorCache.get(css);
    if (!hit) {
        hit = parseColor(css);
        colorCache.set(css, hit);
    }
    return hit;
}

function lerpColor(from: NormalizedColor, to: NormalizedColor, t: number): NormalizedColor {
    if (t <= 0) return from;
    if (t >= 1) return to;
    return [
        from[0] + (to[0] - from[0]) * t,
        from[1] + (to[1] - from[1]) * t,
        from[2] + (to[2] - from[2]) * t,
        from[3] + (to[3] - from[3]) * t,
    ];
}

/** How far a whole new row travels as it enters, and along which axis. */
function entryOffset(direction: EntryDirection, metrics: CodeMetrics): { x: number; y: number } {
    const lineH = metrics.fontSize * metrics.lineHeight;
    // y-up author space: a row arriving from *below* starts at a lower y and
    // rises to zero, which is what "slide up" means on screen.
    if (direction === "up") return { x: 0, y: -lineH * 0.85 };
    if (direction === "down") return { x: 0, y: lineH * 0.85 };
    return { x: -metrics.fontSize * 1.8, y: 0 };
}

// Opacity multiplier for a line's number under the active highlight. The
// number stays bright only when the WHOLE line is highlighted, so we take the
// min token opacity on the line. Returns 1 (no dimming) when no highlight is
// active, so an edit's entries don't drag the number down.
function lineHighlightOpacity(line: IdLine, stateById: Map<number, TokenState>, highlightActive: boolean): number {
    if (!highlightActive) return 1;
    let min = 1;
    for (const tok of line.tokens) {
        if (tok.content.length === 0) continue;
        const op = stateById.get(tok.id)?.opacity ?? 1;
        if (op < min) min = op;
    }
    return min;
}

/** Everything a `Code` node's own instance state supplies to draw one frame. */
export interface DrawCodeState {
    tokenLines: IdLine[];
    metrics: CodeMetrics;
    advanceCache: TokenAdvanceCache;
    /** The one or two layouts this frame draws from — see `frameLayout` in `layout.ts`. */
    from: CodeLayout;
    to: CodeLayout;
    edit: StructuralTransition | null;
    /** Per-token opacity from `resolveTokenStates` (persistent highlight + any active dim transition). */
    tokenStates: Map<number, TokenState>;
    /** Whether a highlight (persistent dim, or a highlight()/resetHighlight() cross-fade) is currently engaged. */
    highlightActive: boolean;
}

/**
 * Draw one frame of a code listing: the settled structure, or — mid
 * structural edit — the two structures it is interpolating between (what
 * stays reflows, what is leaving fades out where it was, what is arriving
 * fades/slides in where it lands). Pure over `state`; touches nothing but
 * `draw`.
 */
export function drawCode(draw: RenderContext2D, state: DrawCodeState): void {
    const { tokenLines, metrics, advanceCache, from, to, edit, tokenStates: dim, highlightActive } = state;

    const progress = edit ? edit.progress : 1;
    const pOut = edit ? windowProgress(edit.phases.out, progress) : 1;
    const pMove = moveProgress(edit);
    const pIn = edit ? windowProgress(edit.phases.in, progress) : 1;
    // Distance an entering row still has to travel: the whole offset when its
    // fade begins, none of it by the time the fade ends.
    const entryTravel = 1 - easeOutCubic(pIn);

    const blockW = edit ? lerpNumber(from.blockW, to.blockW, pMove) : to.blockW;
    const gutter = edit ? lerpNumber(from.gutter, to.gutter, pMove) : to.gutter;
    const gutterGap = to.gutterGap || from.gutterGap;
    // Right edge of the line-number column: one gap to the left of where the
    // code text begins.
    const numberRight = -blockW / 2 + metrics.padding.left + gutter - gutterGap;

    const drawNumber = (label: string, y: number, opacity: number): void => {
        if (opacity <= 0) return;
        const labelW = advanceCache.advance(draw, label, metrics.fontSize, metrics.fontFamily, 0);
        draw.draw(new Graphics2D()
            .text({
                text: label,
                fontSize: metrics.fontSize,
                fontFamily: metrics.fontFamily,
                lineHeight: metrics.lineHeight,
                x: numberRight - labelW / 2,
                y,
                textAlign: 'left',
            })
            .fill([{ type: "solid", color: LINE_NUMBER_COLOR, opacity }]));
    };

    const drawToken = (text: string, x: number, y: number, color: NormalizedColor, opacity: number): void => {
        if (opacity <= 0 || text.length === 0) return;
        const width = advanceCache.advance(draw, text, metrics.fontSize, metrics.fontFamily, metrics.letterSpacing);
        draw.draw(new Graphics2D()
            .text({
                text,
                fontSize: metrics.fontSize,
                fontFamily: metrics.fontFamily,
                lineHeight: metrics.lineHeight,
                letterSpacing: metrics.letterSpacing,
                // The renderer centres a single-token block on the (x, y) it is
                // given, so every token is anchored at the centre of its cell
                // rather than at its left edge. Passing lineHeight makes the
                // block's height deterministic (fontSize × lineHeight) rather
                // than the font's natural metrics, so the vertical centre
                // lands exactly on the slot centre.
                x: x + width / 2,
                y,
                textAlign: 'left',
            })
            .fill([{ type: "solid", color, opacity }]));
    };

    // What survived the edit, and what it brought with it — drawn from the
    // structure the edit lands on.
    for (let i = 0; i < tokenLines.length; i++) {
        const line = tokenLines[i];
        const toIndex = to.lineIndex.get(line.id);
        if (toIndex === undefined) continue;
        const toY = to.lineY[toIndex];

        const direction = edit?.entryByLine.get(line.id);
        let rowY = toY;
        let rowDX = 0;
        let rowAlpha = 1;
        if (edit && direction) {
            // A wholly new row travels as one piece — the line arrives, not a
            // spray of glyphs each finding its own way in.
            const offset = entryOffset(direction, metrics);
            rowY = toY + offset.y * entryTravel;
            rowDX = offset.x * entryTravel;
            rowAlpha = pIn;
        } else if (edit) {
            const fromIndex = from.lineIndex.get(line.id);
            if (fromIndex !== undefined) rowY = lerpNumber(from.lineY[fromIndex], toY, pMove);
        }

        if (metrics.showLineNumbers) {
            drawNumber(String(i + 1), rowY, rowAlpha * lineHighlightOpacity(line, dim, highlightActive));
        }

        for (const token of line.tokens) {
            const box = to.tokens.get(token.id);
            if (!box) continue;

            let x = box.x + rowDX;
            let alpha = rowAlpha;
            let color = tokenColor(token.color);

            if (edit && !direction) {
                if (edit.addedIds.has(token.id)) {
                    // Spliced into a row that already existed: the reflow
                    // already opened the space, so this only has to appear.
                    alpha = pIn;
                } else {
                    const was = from.tokens.get(token.id);
                    if (was) x = lerpNumber(was.x, box.x, pMove);
                    if (edit.fromColorById.has(token.id)) {
                        color = lerpColor(tokenColor(edit.fromColorById.get(token.id)), color, pMove);
                    }
                }
            }

            drawToken(token.content, x, rowY, color, alpha * (dim.get(token.id)?.opacity ?? 1));
        }
    }

    // What the edit takes away, drawn from the structure it is leaving — it
    // has no place in the new one, which is the whole reason it is fading.
    if (edit && pOut < 1) {
        for (let i = 0; i < edit.from.length; i++) {
            const line = edit.from[i];
            const fromIndex = from.lineIndex.get(line.id);
            if (fromIndex === undefined) continue;
            const toIndex = to.lineIndex.get(line.id);
            // A row that survived the edit is still moving, so its outgoing
            // tokens travel with it; a deleted row stays where it was and
            // dissolves while the rows below close over it.
            const y = toIndex === undefined
                ? from.lineY[fromIndex]
                : lerpNumber(from.lineY[fromIndex], to.lineY[toIndex], pMove);

            let drewAny = false;
            for (const token of line.tokens) {
                if (!edit.removedIds.has(token.id)) continue;
                const box = from.tokens.get(token.id);
                if (!box) continue;
                drewAny = true;
                drawToken(token.content, box.x, y, tokenColor(token.color), 1 - pOut);
            }
            if (drewAny && toIndex === undefined && metrics.showLineNumbers) {
                drawNumber(String(i + 1), y, 1 - pOut);
            }
        }
    }
}
