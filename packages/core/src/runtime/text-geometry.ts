import { Node2D } from "@/nodes/base/node2d";
import { Text } from "@/nodes/text/text-node";
import { Vector2 } from "@/attributes/layout/vector2";
import { applyToPoint } from "@/attributes/layout/matrix2d";
import { Measurer } from "@/render/measurer";
import { caretCount } from "@/render/text-layout";
import { renderMatrix } from "./node-picking";

/**
 * Where a Text node's caret slots landed on screen — the measurement a host
 * needs to draw its own text cursor and selection over the rendered glyphs.
 *
 * **Space.** Viewport space, exactly as {@link NodeBox}: origin at the viewport
 * centre, y-up, viewport units, camera folded in. A caret and the selection box
 * around it therefore come out of the same walk and cannot disagree.
 *
 * **Why the host draws it.** Anything approximating glyph positions outside the
 * shaper — a DOM input laid over the canvas, say — drifts from the render the
 * moment the font, the line height or the wrapping does, and CSS `line-height`
 * and Skia's height multiplier are not the same quantity to begin with. Handing
 * over the real slots means the rendered text stays the thing being edited.
 */
export interface NodeTextLayout {
    /** Structural path of the node measured, as {@link NodeBox.path}. */
    path: string;
    /** The string the slots describe. */
    text: string;
    /**
     * Every caret slot, in offset order: `carets[i]` sits before character `i`,
     * and the last sits after the final character — so there are `text.length + 1`
     * of them, and a caret offset is always a valid index.
     *
     * Each is a *segment*, not a point, because a rotated node's cursor is a
     * rotated line: draw from `top` to `bottom`.
     */
    carets: TextCaret[];
    /**
     * Line ranges over caret offsets, for Home/End and vertical arrow keys. A
     * hard line break belongs to neither line, so `lines[n].end` and
     * `lines[n + 1].start` differ by one where the break is.
     */
    lines: { start: number; end: number }[];
}

/** One caret slot: the line an editor would draw for a cursor at this offset. */
export interface TextCaret {
    /** Character offset this slot sits before. */
    offset: number;
    /** Top and bottom of the cursor, viewport space. */
    top: Vector2;
    bottom: Vector2;
}

/** One line's worth of a selected range, as a quad in viewport space. */
export interface TextRangeQuad {
    topLeft: Vector2;
    topRight: Vector2;
    bottomRight: Vector2;
    bottomLeft: Vector2;
}

/**
 * Measure `node`'s caret slots in viewport space, or `null` when it has none to
 * report — not a {@link Text}, nothing shaped yet, or a shape the caret model
 * doesn't cover (see {@link Measurer.layoutTextBlock}).
 *
 * The block-local layout comes from the backend, because that is where glyphs
 * are actually positioned; everything below is the same mapping
 * {@link nodeBox} applies to a node's corners.
 */
export function nodeTextLayout(
    node: Node2D,
    path: string,
    scope: Measurer,
): NodeTextLayout | null {
    if (!(node instanceof Text)) return null;
    const block = scope.layoutTextBlock(node._textState());
    if (!block) return null;

    const m = renderMatrix(node);
    // The block is centred on the node's own origin — which is also where
    // `_localBounds` centres the box — so a block-local offset is a node-local
    // one, unshifted. Block coordinates are already canvas (y-down), which is
    // the space the matrix works in, so unlike `worldAnchors` (which takes y-up
    // corner offsets) only the *result* is flipped back to y-up viewport space.
    const at = (x: number, y: number): Vector2 => {
        const p = applyToPoint(m, { x, y });
        return { x: p.x, y: -p.y };
    };

    const carets: TextCaret[] = new Array(caretCount(block));
    const lines: { start: number; end: number }[] = [];
    for (const line of block.lines) {
        lines.push({ start: line.start, end: line.end });
        for (let i = 0; i < line.carets.length; i++) {
            const x = line.carets[i];
            carets[line.start + i] = {
                offset: line.start + i,
                top: at(x, line.top),
                bottom: at(x, line.bottom),
            };
        }
    }

    return { path, text: node.text, carets, lines };
}

/**
 * The caret offset nearest `point` (viewport space) — what a click or a drag
 * over the rendered text should place the cursor at.
 *
 * Nearest *slot*, by distance to the caret segment rather than to its midpoint:
 * a click below a short first line should land on that line's nearest slot, and
 * midpoints would pull it toward whichever line's centre happened to be closer.
 * Segment distance also keeps this correct for rotated and scaled text without
 * needing a separate case, since the slots arrive already transformed.
 */
export function caretOffsetAt(layout: NodeTextLayout, point: Vector2): number {
    let best = 0;
    let bestDistance = Infinity;
    for (const caret of layout.carets) {
        const d = distanceToSegment(point, caret.top, caret.bottom);
        if (d < bestDistance) {
            bestDistance = d;
            best = caret.offset;
        }
    }
    return best;
}

/**
 * The quads covering `[start, end)`, one per line the range touches — what a
 * host fills to draw a selection highlight.
 *
 * Per line rather than one box for the whole range, because a range spanning a
 * line break covers two disjoint areas and a single enclosing box would paint
 * over the gap between them.
 */
export function caretRangeQuads(
    layout: NodeTextLayout,
    start: number,
    end: number,
): TextRangeQuad[] {
    const from = Math.max(0, Math.min(start, end));
    const to = Math.min(layout.carets.length - 1, Math.max(start, end));
    const quads: TextRangeQuad[] = [];
    for (const line of layout.lines) {
        const a = Math.max(from, line.start);
        const b = Math.min(to, line.end);
        if (a >= b) continue;                    // empty on this line
        const left = layout.carets[a];
        const right = layout.carets[b];
        quads.push({
            topLeft: left.top,
            topRight: right.top,
            bottomRight: right.bottom,
            bottomLeft: left.bottom,
        });
    }
    return quads;
}

/** Distance from `p` to the segment `a`–`b`. */
function distanceToSegment(p: Vector2, a: Vector2, b: Vector2): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;
    // A degenerate segment (a zero-height line box) is just a point.
    const t = lengthSq === 0
        ? 0
        : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
