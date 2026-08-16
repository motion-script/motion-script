import type { GridFillResolved } from "@motion-script/core";
import type { Shader } from "@motion-script/canvaskit";
import { getOrCompileSkSL } from "../sksl-cache";
import { featherPx, FillRenderer, type FillRendererContext } from "./renderer";

/**
 * Two rulings — the divisions and the subdivisions nested inside them — combined
 * by coverage rather than drawn in sequence.
 *
 * `max` of the two, not a sum: a subdivision line falls on top of every division
 * line (the minor pitch divides the major one exactly), and adding their
 * coverages there would draw that line at up to double strength — a grid whose
 * major lines got *darker* the more you subdivided it.
 *
 * Output is premultiplied and deliberately not multiplied by the fill's opacity
 * or the world alpha; see the note on the dot-grid fill for why.
 */
const SOURCE = `
// Declared widest-first, so the flat array handed to makeShader needs no padding
// — see the note on the dot-grid fill's source for what a gap here costs.
uniform vec4  u_color;
uniform vec2  u_origin;       // shape bounds origin, shape-local logical px
uniform vec2  u_size;         // shape bounds size, shape-local logical px
uniform vec2  u_offset;       // ruling shift, logical px
uniform float u_divisions;    // cells across the shape, per axis
uniform float u_subdivisions; // finer cells inside each division
uniform float u_halfMajor;    // half a division line's thickness, logical px
uniform float u_halfMinor;    // half a subdivision line's thickness, logical px
uniform float u_feather;      // coverage ramp width, logical px

/*
 * Coverage of the nearest line of a ruling at the given pitch, on either axis.
 *
 * SkSL's mod is floor-based, so the distance to the nearest multiple is
 * min(m, pitch - m) whatever the sign of the coordinate.
 */
float ruling(vec2 p, vec2 pitch, float halfWidth, float feather) {
    // A width of zero means the order is switched off, and has to be answered
    // here rather than left to the ramp: the ramp is centred on the line, so a
    // zero-width one still lands half a pixel of coverage on the pixels it runs
    // through — a ruling you asked not to be drawn, drawn faintly.
    if (halfWidth <= 0.0) return 0.0;
    vec2 m = mod(p, pitch);
    vec2 d = min(m, pitch - m);
    return clamp((halfWidth - min(d.x, d.y)) / feather + 0.5, 0.0, 1.0);
}

vec4 main(vec2 fragCoord) {
    vec2 p = fragCoord - u_origin - u_offset;

    // Cells follow the box, so a non-square shape gets non-square cells — see
    // GridFillProp. Floored well above zero because a pitch of 0 makes mod
    // undefined, which paints garbage rather than nothing.
    vec2 major = max(u_size / max(u_divisions, 0.0001), vec2(0.01));
    vec2 minor = major / max(u_subdivisions, 1.0);

    float cover = max(
        ruling(p, major, u_halfMajor, u_feather),
        ruling(p, minor, u_halfMinor, u_feather)
    );

    float a = u_color.a * cover;
    return vec4(u_color.rgb * a, a);
}
`;

/**
 * Grid fill — ruled lines dividing the shape into cells.
 *
 * Shader-rendered for the same reasons as the dot grid, plus one of its own: the
 * cell pitch is the shape's size over a division count and is almost never a
 * whole number of pixels, so a baked tile would round it and let the ruling
 * drift by a pixel or more across a wide shape.
 */
export class GridFillRenderer extends FillRenderer<GridFillResolved> {
    /** The shader built for the fill drawn most recently — see the dot-grid renderer. */
    private live: Shader | null = null;

    private replaceLive(shader: Shader | null): void {
        this.live?.delete();
        this.live = shader;
    }

    applyPaint(fill: GridFillResolved, ctx: FillRendererContext): boolean {
        const bounds = ctx.getShapeBounds();
        if (!bounds) return false;

        const width = bounds.right - bounds.left;
        const height = bounds.bottom - bounds.top;
        if (width <= 0 || height <= 0) return false;

        const effect = getOrCompileSkSL(SOURCE, ctx.canvasKit);
        if (!effect) return false;

        // Rounded, so the fine ruling always nests a whole number of times inside
        // a cell: a fractional count would put minor lines at positions that
        // never line up with the major ones (see the fill's `lerp`).
        const subdivisions = Math.max(1, Math.round(fill.subdivisions));

        // Order matches the shader's declarations exactly — see the note there.
        const shader = effect.makeShader([
            fill.color[0], fill.color[1], fill.color[2], fill.color[3],
            bounds.left, bounds.top,
            width, height,
            fill.offset.x, fill.offset.y,
            Math.max(0.0001, fill.divisions),
            subdivisions,
            Math.max(0, fill.strokeWidth) * 0.5,
            Math.max(0, fill.subdivisionWidth) * 0.5,
            featherPx(ctx),
        ]);
        if (!shader) return false;

        this.replaceLive(shader);
        ctx.paint.setShader(shader);
        return true;
    }

    override dispose(): void {
        this.replaceLive(null);
    }
}
