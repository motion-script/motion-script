import { TEXT_SHAPING_KEYS, type TextShapingKey, type TextStyle } from "@/runtime/builtin-context";
import type { ResolvedTextSpan } from "@/attributes/text/span";
import { Graphics, type GraphicsOp, type GraphicsShapeOp } from "./graphics";

/** The recorded `text` op, state and all. */
type TextOp = Extract<GraphicsShapeOp, { kind: "text" }>;
/** The recorded `richText` op, state and all. */
type RichTextOp = Extract<GraphicsShapeOp, { kind: "richText" }>;

/**
 * The span-level half of {@link TEXT_SHAPING_KEYS}. A `richText` op carries its
 * typography per span rather than on the shape, so a default has to be filled in
 * span by span — except `lineHeight`/`textAlign`, which lay the block out as a
 * whole and so live on the op itself.
 */
const SPAN_KEYS = [
    'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing',
] as const satisfies readonly TextShapingKey[];

/** The `richText` op's own layout keys — the ones that aren't per-span. */
const RICHTEXT_BLOCK_KEYS = [
    'lineHeight', 'textAlign',
] as const satisfies readonly TextShapingKey[];

/**
 * `graphics` with `style` filled into every `text`/`richText` op that left a
 * shaping field unset — the drawn-text half of `<DefaultTextStyle>`.
 *
 * A `Text` node inherits defaults through the context channel, once, at bind
 * time (`applyTextDefaults`); a raw `Graphics` has no node to bind, so it
 * inherits here instead, at draw time, from the scope it is drawn in. Called
 * from `RenderContext.draw`, so a custom node's `ctx.draw(...)`, an offscreen
 * rasterization and the precomp pass's asset walk all see the same resolved op
 * list — which is what makes an inherited font actually *load* rather than
 * merely be asked for.
 *
 * A key counts as unset only when it is `undefined`: an op that names a value
 * always wins, exactly as an author-set prop beats an inherited one on a node.
 * Returns `graphics` itself when nothing changes, which is the common case (the
 * scene sets no defaults, or every op already names its own).
 */
export function applyGraphicsTextDefaults(graphics: Graphics, style: TextStyle): Graphics {
    if (!hasShapingDefaults(style)) return graphics;

    const ops = graphics.ops();
    let next: GraphicsOp[] | null = null;
    for (let i = 0; i < ops.length; i++) {
        const op = ops[i];
        const patched = op.kind === "text"
            ? patchText(op, style)
            : op.kind === "richText"
                ? patchRichText(op, style)
                : null;
        if (!patched) continue;
        // Copy lazily: an op list with nothing to fill in keeps its identity, so
        // a fully-specified Text node allocates nothing on the way through.
        if (!next) next = ops.slice();
        next[i] = patched;
    }
    return next ? graphics._withOps(next) : graphics;
}

/** Does `style` set anything a drawn text op could inherit? */
function hasShapingDefaults(style: TextStyle): boolean {
    for (const key of TEXT_SHAPING_KEYS) {
        if (style[key] !== undefined) return true;
    }
    return false;
}

function patchText(op: TextOp, style: TextStyle): TextOp | null {
    let state: Record<string, unknown> | null = null;
    for (const key of TEXT_SHAPING_KEYS) {
        if (op.state[key] !== undefined) continue;
        const value = style[key];
        if (value === undefined) continue;
        (state ??= { ...op.state })[key] = value;
    }
    return state ? { kind: "text", state: state as TextOp["state"] } : null;
}

function patchRichText(op: RichTextOp, style: TextStyle): RichTextOp | null {
    let state: Record<string, unknown> | null = null;

    for (const key of RICHTEXT_BLOCK_KEYS) {
        if (op.state[key] !== undefined) continue;
        const value = style[key];
        if (value === undefined) continue;
        (state ??= { ...op.state })[key] = value;
    }

    const spans = patchSpans(op.state.spans, style);
    if (spans) (state ??= { ...op.state }).spans = spans;

    return state ? { kind: "richText", state: state as RichTextOp["state"] } : null;
}

/** The spans with defaults filled in, or `null` when none needed any. */
function patchSpans(
    spans: ResolvedTextSpan[] | undefined,
    style: TextStyle,
): ResolvedTextSpan[] | null {
    if (!spans || spans.length === 0) return null;
    let next: ResolvedTextSpan[] | null = null;
    for (let i = 0; i < spans.length; i++) {
        const span = spans[i];
        let patched: Record<string, unknown> | null = null;
        for (const key of SPAN_KEYS) {
            if (span[key] !== undefined) continue;
            const value = style[key];
            if (value === undefined) continue;
            // A span has no autofit mode — it is a run inside a block, sized by
            // the block. An inherited `fontSize: 'autofit'` has nothing to mean
            // here, so it's skipped rather than written through as a bad number.
            if (key === "fontSize" && value === "autofit") continue;
            (patched ??= { ...span })[key] = value;
        }
        if (!patched) continue;
        if (!next) next = spans.slice();
        next[i] = patched as unknown as ResolvedTextSpan;
    }
    return next;
}
