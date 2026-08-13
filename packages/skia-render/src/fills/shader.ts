import type {
    ShaderChildDecl,
    ShaderFillResolved,
    SkSLUniformRecord,
    UniformSlot,
} from "@motion-script/core";
import { coordsMatrix, describeUniforms, parseShaderChildren, writeUniforms } from "@motion-script/core";
import type { Image as CKImage, RuntimeEffect, Shader } from "@motion-script/canvaskit";
import { getOrCompileSkSL } from "../sksl-cache";
import { FillRenderer, type FillRendererContext } from "./renderer";

/** Everything derivable from a compiled program, memoised against it. */
interface ProgramInfo {
    slots: UniformSlot[];
    floats: number;
    children: ShaderChildDecl[];
}

/**
 * Keyed by the `RuntimeEffect` rather than by source string, so the memo can't
 * outlive the program and needs no eviction of its own. Safe because
 * `getOrCompileSkSL` is itself keyed by source, making the two 1:1 — which is
 * also what lets `children` (parsed out of the *source*) live here.
 */
const programs = new WeakMap<RuntimeEffect, ProgramInfo>();

function programInfo(effect: RuntimeEffect, source: string): ProgramInfo {
    const cached = programs.get(effect);
    if (cached) return cached;
    const info: ProgramInfo = {
        slots: describeUniforms(effect),
        floats: effect.getUniformFloatCount(),
        children: parseShaderChildren(source),
    };
    programs.set(effect, info);
    return info;
}

/** Diagnostics the author has to be able to see, without spamming a 3600-frame export. */
const warned = new Set<string>();

function warnOnce(message: string): void {
    if (warned.has(message)) return;
    if (warned.size > 512) warned.clear();
    warned.add(message);
    console.warn(`[SkSL] ${message}`);
}

/**
 * Child shaders wrapping a decoded image, by asset src.
 *
 * The image belongs to the asset manager; what we own is the shader wrapping it,
 * and that has to outlive the `makeShaderWithChildren` call binding it as a child
 * — creating one per draw would either leak or be freed out from under the shader
 * still using it. The same reasoning as the `texture` effect's wrapper cache,
 * plus the image identity, so a re-decode after eviction rebuilds the wrapper
 * instead of pointing it at a deleted texture.
 */
const wrappers = new Map<string, { image: CKImage; shader: Shader }>();

function textureShader(src: string, image: CKImage, ck: FillRendererContext["canvasKit"]): Shader {
    const cached = wrappers.get(src);
    if (cached && cached.image === image) return cached.shader;
    cached?.shader.delete();
    // Repeat rather than clamp: the shader does its own mapping into the image's
    // pixel space, so anything sampling past the edge means to tile, and clamping
    // would smear the edge row across everything beyond the first copy.
    const shader = image.makeShaderOptions(
        ck.TileMode.Repeat, ck.TileMode.Repeat, ck.FilterMode.Linear, ck.MipmapMode.None,
    );
    wrappers.set(src, { image, shader });
    return shader;
}

/**
 * Custom SkSL shader fill — the author writes the fragment function.
 *
 * Two things make this more than `Effects.sksl` pointed at a fill. It is
 * evaluated per *covered pixel* of the shape's own path, so it clips to whatever
 * painted it and needs no offscreen layer; and it resolves against the fill's
 * bounds, so `coords` can hand the author a normalised or centred coordinate
 * through a **local matrix** rather than by rewriting the source. That matters
 * for more than ergonomics: because the transform lives in the matrix, one
 * compiled program serves every size and every mode, so `getOrCompileSkSL` holds
 * exactly one entry per authored shader — unlike the fractal-noise fill, which
 * bakes its basis, octave count and stop count into the source.
 *
 * No `preflight`: compiling and wrapping an image are both synchronous, so the
 * fill also paints on the stroke and shadow-silhouette paths, where preflight
 * never runs.
 *
 * Note it does **not** fold `opacity` or `worldAlpha` into the shader's output.
 * `FillHandler` has already put both on the paint via `setAlphaf`, and Skia
 * modulates a shader's output by the paint alpha — applying it again here would
 * square it.
 */
export class ShaderFillRenderer extends FillRenderer<ShaderFillResolved> {
    /**
     * The shader built for the fill drawn most recently.
     *
     * Not `ctx.transientPaintObjects`, which the *stroke* handler never drains —
     * a shader-filled stroke would leak one per frame. Not a keyed cache either:
     * an animated uniform changes every frame, so a cache would allocate a shader
     * per frame and never hit. Exactly one is kept alive and released when the
     * next fill is configured, by which point the previous fill's shapes have
     * been drawn — the handler paints each fill before moving to the next.
     */
    private live: Shader | null = null;

    private replaceLive(shader: Shader | null): void {
        this.live?.delete();
        this.live = shader;
    }

    applyPaint(fill: ShaderFillResolved, ctx: FillRendererContext): boolean {
        if (!fill.source) return false;

        const bounds = ctx.getShapeBounds();
        if (!bounds) return false;
        const width = bounds.right - bounds.left;
        const height = bounds.bottom - bounds.top;
        // A zero-sized box makes the `normalized`/`centered` matrix singular, and
        // there is nothing to shade anyway.
        if (width <= 0 || height <= 0) return false;

        const effect = getOrCompileSkSL(fill.source, ctx.canvasKit);
        if (!effect) return false;   // compile error, already warned by the cache
        const info = programInfo(effect, fill.source);

        // Supplied for whichever of these the source declares, and overridable by
        // an author key of the same name. No `u_alpha`: see the class doc.
        //
        // `u_scale` is a getter because `getDeviceScale` reads the canvas matrix,
        // which allocates in wasm — and `writeUniforms` only reaches for a built-in
        // the program actually declares, so a shader that doesn't ask never pays.
        const builtins: SkSLUniformRecord = {
            u_size: [width, height],
            u_resolution: [width, height],
            u_origin: [bounds.left, bounds.top],
            u_aspect: width / height,
            u_time: ctx.elapsed,
            get u_scale() { return ctx.getDeviceScale(); },
        };

        const uniforms = writeUniforms(info.slots, info.floats, fill.uniforms, builtins, fill.source);
        const matrix = coordsMatrix(fill.coords, bounds);

        let shader: Shader | null;
        if (info.children.length > 0) {
            const children = this.bindChildren(info.children, fill, ctx);
            if (!children) return false;
            shader = effect.makeShaderWithChildren(uniforms, children, matrix);
        } else {
            if (fill.textures?.length) {
                warnOnce("a shader fill supplies textures but its source declares no `uniform shader`.");
            }
            shader = effect.makeShader(uniforms, matrix);
        }
        // Null means a uniform-buffer mismatch Skia rejected outright. Decline
        // rather than crash on the delete below.
        if (!shader) return false;

        this.replaceLive(shader);
        ctx.paint.setShader(shader);
        return true;
    }

    /**
     * Resolve the source's child declarations to shaders, in Skia's child order.
     *
     * By **name**, not by position: `RuntimeEffect` exposes no child reflection at
     * all, so the order comes from parsing the source, but the author's `textures`
     * list is their own and a silently transposed pair is the worst failure mode
     * available — it renders, just wrong.
     *
     * Returns null to decline the whole fill, because a partially bound program
     * would sample transparent black through the missing child.
     */
    private bindChildren(
        decls: readonly ShaderChildDecl[],
        fill: ShaderFillResolved,
        ctx: FillRendererContext,
    ): Shader[] | null {
        const out: Shader[] = [];
        for (const decl of decls) {
            if (decl.kind !== "shader") {
                warnOnce(`a shader fill declares \`uniform ${decl.kind} ${decl.name}\`, which it cannot bind. Only \`uniform shader\` is supported.`);
                return null;
            }
            const texture = fill.textures?.find((t) => t.name === decl.name);
            if (!texture) {
                warnOnce(`a shader fill declares \`uniform shader ${decl.name}\` but no texture of that name was supplied.`);
                return null;
            }
            const image = ctx.assets.getCKImage(texture.src);
            // Not decoded yet. A normal transient state, not a mistake — declining
            // is the same contract an image fill has while it decodes, and drawing
            // something here would flash.
            if (!image) return null;
            out.push(textureShader(texture.src, image, ctx.canvasKit));
        }
        return out;
    }

    dispose(): void {
        this.replaceLive(null);
        for (const { shader } of wrappers.values()) shader.delete();
        wrappers.clear();
    }
}
