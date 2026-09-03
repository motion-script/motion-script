import { FillResolved } from "../shape/fill/union";
import { Fill } from "../shape/fill/chain";
import { Stroke, StrokeResolved } from "../shape/stroke/mapper";

export type FontStyle = 'normal' | 'italic' | 'oblique';

/**
 * A styled run of text. Spans may nest — children inherit any style fields
 * the parent set and override the ones they redeclare (Flutter-style
 * TextSpan). A span with `children` and no `text` acts as a pure style
 * scope; a span with both contributes its `text` before its children.
 */
export interface TextSpan {
    text?: string;
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: number;
    fontStyle?: FontStyle;
    letterSpacing?: number;
    fill?: Fill;
    stroke?: Stroke;
    children?: TextSpan[];
}

/**
 * A span flattened against its parents — every style field is concrete and
 * fills/strokes are resolved. Newlines in `text` are preserved; the renderer
 * splits on `\n` to lay out lines.
 */
export interface ResolvedTextSpan {
    text: string;
    fontFamily: string;
    fontSize: number;
    fontWeight: number;
    fontStyle: FontStyle;
    letterSpacing: number;
    fill: FillResolved[];
    stroke: StrokeResolved[];
}

/**
 * A statically styled stretch of a {@link Text} node's string — the declarative
 * half of per-character styling.
 *
 * The other half is {@link TextSelection}, and the two answer different
 * questions. A selection is an **animation target**: it is created imperatively,
 * it layers over its neighbours, and a `to()` moves it. A run is a **property**:
 * it is part of what the node *is*, it arrives in the constructor with
 * everything else, and it is replaced wholesale when the node is restated.
 *
 * That distinction is what an editor needs. Styling three words bold is a fact
 * about the node, not a step on its timeline — so it belongs in the props, where
 * it can be diffed, overridden and restated like the family or the size. A host
 * that had to build selections instead could not paint a styling change onto a
 * live node at all, because a selection is not something you can `set()` a node
 * to; that is the concrete reason this exists.
 *
 * Runs are applied **under** selections, so an animation still wins over the
 * static styling it is animating — which is the only precedence that lets you
 * fade a word that happens to be bold.
 *
 * Ranges are half-open `[start, end)` character offsets, clamped to the string
 * and taken in order; overlapping runs are resolved last-wins.
 */
export interface TextRun {
    start: number;
    end: number;
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: number;
    fontStyle?: FontStyle;
    letterSpacing?: number;
    fill?: Fill;
    stroke?: Stroke;
}

/** A {@link TextRun} whose paints have been resolved, as the node stores it. */
export interface ResolvedTextRun extends Omit<TextRun, 'fill' | 'stroke'> {
    fill?: FillResolved[];
    stroke?: StrokeResolved[];
}
