import { TextAlign } from "@/attributes/text/align";
import { FontStyle } from "@/attributes/text/span";
import { FillResolved } from "@/attributes/shape/fill/union";
import { StrokeResolved } from "@/attributes/shape/stroke/mapper";
import { PathData } from "./path";
import { ShapeAnchorInput, ShapeState, resolveShapeAnchor, resolveShapePivot, stripShapeAnchorKeys } from "./shape";

/**
 * One contiguous piece of a Text node split at selection boundaries. Pieces
 * carry their effective shaping inputs (`text`/`fontWeight`/`letterSpacing`)
 * plus draw-time overrides applied per shaped run: `opacity` folded into the
 * paint alpha, an optional `fill`/`stroke` override (falls back to the node's
 * when omitted), and a transform applied about the run's centered position.
 *
 * Present only when a Text node has active selections; otherwise the node
 * renders as a single string with no segments (unchanged behavior).
 */
export interface TextSegment {
    text: string;
    fontWeight: number;
    letterSpacing: number;
    opacity: number;
    x: number;
    y: number;
    scale: number;
    rotation: number;
    /** Override fill for this piece; falls back to the node's fill when undefined. */
    fill?: FillResolved[];
    /** Override stroke for this piece; falls back to the node's stroke when undefined. */
    stroke?: StrokeResolved[];
}

export interface TextState extends ShapeState {
    text: string;
    fontSize: number | 'autofit';
    fontFamily: string;
    fontWeight: number;
    fontStyle: FontStyle;
    letterSpacing: number;
    lineHeight: number;
    textAlign: TextAlign;
    wrap: boolean;
    minFontSize: number;
    width: number;
    height: number;
    /**
     * Per-piece overrides when the node has active text selections. When set,
     * the renderer shapes these pieces together (one paragraph) and paints each
     * shaped run with its piece's overrides instead of the node's single fill.
     */
    segments?: TextSegment[];
    /**
     * When set, the text is wrapped around this path (text-on-path) instead of
     * laid out as straight lines: each glyph is positioned and rotated to follow
     * the path, centered on its baseline, and glyphs past the path end are
     * clipped. Mutually exclusive with `segments` in v1.
     */
    path?: PathData | null;
}


/**
 * The family this text is set in — **required**, with no substitute.
 *
 * It used to fall back to `"Arial"`. That is the wrong shape of answer for a
 * renderer whose whole job is that the picture is the one that was asked for: a
 * drawn op reaching this with no family means nobody stated one — not the op, not
 * an enclosing `DefaultTextStyle`, not the theme's `default` preset — and
 * substituting a face silently produces text in a typeface the author never
 * chose, at metrics they never measured, in a frame that looks finished. The
 * failure it hides is a font that was never declared and so never loaded, which
 * is exactly the class of bug the declared-asset work exists to surface.
 *
 * Named as an error naming its three fixes, because "no font family" is not
 * actionable and "set one on the op, on an enclosing DefaultTextStyle, or as the
 * theme's default preset" is.
 */
function requireFontFamily(descriptor: Partial<TextState>): string {
    const family = descriptor.fontFamily;
    if (typeof family === "string" && family !== "") return family;
    const text = descriptor.text ? ` drawing "${descriptor.text.slice(0, 32)}"` : "";
    throw new Error(
        `Text${text} has no fontFamily. Set one on the text itself, on an `
        + `enclosing <DefaultTextStyle>, or as the theme's \`default\` typography `
        + `preset — there is no fallback face.`,
    );
}

export function withTextDescriptor(descriptor: Partial<TextState> & ShapeAnchorInput): TextState {
    const width = descriptor.width ?? 0;
    const height = descriptor.height ?? 0;
    const { x, y, pivot } = resolveShapeAnchor(descriptor, width, height);
    return {
        ...stripShapeAnchorKeys(descriptor),
        opacity: descriptor.opacity ?? 1,
        rotation: descriptor.rotation ?? 0,
        scale: descriptor.scale ?? 1,
        x,
        y,
        start: descriptor.start ?? 0,
        end: descriptor.end ?? 1,
        pivot: resolveShapePivot(pivot),
        text: descriptor.text ?? "",
        fontSize: descriptor.fontSize ?? 16,
        fontFamily: requireFontFamily(descriptor),
        fontWeight: descriptor.fontWeight ?? 400,
        fontStyle: descriptor.fontStyle ?? 'normal',
        letterSpacing: descriptor.letterSpacing ?? 0,
        lineHeight: descriptor.lineHeight ?? 0,
        textAlign: descriptor.textAlign ?? 'center',
        wrap: descriptor.wrap ?? false,
        minFontSize: descriptor.minFontSize ?? 12,
        width: descriptor.width ?? 0,
        height: descriptor.height ?? 0,
        segments: descriptor.segments,
        path: descriptor.path ?? null,
    };
}
