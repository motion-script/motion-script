import type { BlendMode } from '../blend';
import type { FillData } from '../registry';
import {
    lerpUniformRecord,
    normalizeUniforms,
    uniformRecordsEqual,
    type ShaderFillCoords,
    type SkSLUniform,
    type SkSLUniformRecord,
} from '../../sksl-uniforms';

export type { ShaderFillCoords };

/**
 * Ceiling on bound samplers. Skia has no hard limit here, but a fill wanting more
 * than a handful of textures is really a 3D scene, and the cap keeps a typo in a
 * generated list from exhausting texture units.
 */
const MAX_TEXTURES = 4;

/** An image bound to one of the shader's `uniform shader` declarations. */
export interface ShaderTexture {
    /** The `uniform shader` name in the source this image binds to. */
    name: string;
    /** Asset path, resolved like any other image fill's `src`. */
    src: string;
}

/**
 * A custom SkSL shader, painted as a fill.
 *
 * The escape hatch at the end of the procedural spectrum: where
 * {@link NoiseFillProp} and {@link FractalNoiseFillProp} expose a fixed set of
 * knobs over a fixed field, this hands the whole fragment function to the author.
 * It is still a fill, so it paints inside the shape's own path — an `Ellipse`, a
 * `Path`, a run of `Text` — stacks as one layer in the fill array, and inherits
 * the layer's `opacity`/`blend`/`space` like every other kind.
 *
 *   <Rect fill={Fills.shader(src, { uniforms: { u_amount: 0.4 } })} />
 *   <Text text="DEPTH" fontSize={320} fill={Fills.shader(src)} />
 *
 * The contract on the source is `vec4 main(vec2 fragCoord)` returning
 * **premultiplied** rgba. It must *not* fold `opacity` in: the fill layer's
 * opacity is already on the paint as an alpha the shader's output is modulated
 * by, so a shader applying it again renders at the square of what was asked for.
 * That is also why no `u_alpha` built-in is offered.
 *
 * Uniforms are supplied **by name**, not by position, and marshalled by
 * reflecting the compiled program. So declaration order doesn't matter, a
 * declared-but-unsupplied uniform reads as zero with a warning instead of
 * silently refusing to paint, and the renderer can fill in built-ins
 * (`u_size`, `u_origin`, `u_resolution`, `u_aspect`, `u_time`, `u_scale`) for
 * whichever of them the source happens to declare.
 *
 * `source` is the compile-cache key, so it **snaps** at a tween's midpoint rather
 * than interpolating — tweening it would compile a program per frame. Keep the
 * source constant (hoist it to module scope) and put everything that changes in a
 * uniform, which costs nothing: uniform values are an in-place write.
 */
export interface ShaderFillProp {
    type: 'shader';
    /** SkSL source declaring `vec4 main(vec2 fragCoord)`. Hoist it; don't rebuild it per frame. */
    source: string;
    /**
     * Uniform values keyed by their declared name. The `sksl` effect's positional
     * `[{name, value}]` array is accepted too, so a shader can move between an
     * effect and a fill unchanged.
     */
    uniforms?: SkSLUniformRecord | readonly SkSLUniform[];
    /** What `fragCoord` means. Default `'normalized'`. See {@link ShaderFillCoords}. */
    coords?: ShaderFillCoords;
    /** Images bound to the source's `uniform shader` declarations, matched by name. */
    textures?: readonly ShaderTexture[];
    opacity?: number;
    blend?: BlendMode;
}

export interface ShaderFillResolved {
    type: 'shader';
    source: string;
    uniforms: SkSLUniformRecord;
    coords: ShaderFillCoords;
    textures?: ShaderTexture[];
    opacity?: number;
    blend?: BlendMode;
}

/** Copy the texture list, dropping malformed entries and capping the length. */
function resolveTextures(textures: readonly ShaderTexture[] | undefined): ShaderTexture[] | undefined {
    if (!textures?.length) return undefined;
    const out: ShaderTexture[] = [];
    for (const texture of textures) {
        if (!texture?.name || !texture?.src) continue;
        if (out.length >= MAX_TEXTURES) {
            console.warn(`[SkSL] A shader fill declares more than ${MAX_TEXTURES} textures; the rest are ignored.`);
            break;
        }
        out.push({ name: texture.name, src: texture.src });
    }
    return out.length ? out : undefined;
}

function texturesEqual(a: ShaderTexture[] | undefined, b: ShaderTexture[] | undefined): boolean {
    if (a === b) return true;
    if (!a || !b || a.length !== b.length) return false;
    return a.every((t, i) => t.name === b[i].name && t.src === b[i].src);
}

export const shaderFill: FillData<ShaderFillResolved> = {
    resolve: (prop: ShaderFillProp) => ({
        type: 'shader',
        source: prop.source ?? '',
        // Normalised (and key-sorted) here rather than at paint time so `equals`
        // and any structural diff see the same canonical record the renderer
        // marshals, whichever authoring shape it came in as.
        uniforms: normalizeUniforms(prop.uniforms),
        coords: prop.coords ?? 'normalized',
        textures: resolveTextures(prop.textures),
        opacity: prop.opacity,
        blend: prop.blend,
    }),

    // `source`, `coords` and `textures` snap; only the uniform values and
    // `opacity` interpolate. The source is `getOrCompileSkSL`'s cache key, so
    // there is nothing halfway between two programs to cross to — the same reason
    // an image fill's `src` and a 3D fill's scene snap. `coords` is a discrete
    // matrix and a texture list is a discrete set of bindings.
    //
    // Deliberately returns neither `type` nor `blend`: `FillResult` omits both and
    // `lerpFill` reassembles via `{ ...a, ...lerp(...) }`, which is also what makes
    // the ragged-array self-pair (a fill fading against a copy of itself, when two
    // fill arrays differ in length) work.
    lerp: (a, b, t) => ({
        source: t < 0.5 ? a.source : b.source,
        uniforms: lerpUniformRecord(a.uniforms, b.uniforms, t),
        coords: t < 0.5 ? a.coords : b.coords,
        textures: t < 0.5 ? a.textures : b.textures,
        opacity: (a.opacity ?? 1) + ((b.opacity ?? 1) - (a.opacity ?? 1)) * t,
    }),

    equals: (a, b) =>
        a.source === b.source &&
        a.coords === b.coords &&
        uniformRecordsEqual(a.uniforms, b.uniforms) &&
        texturesEqual(a.textures, b.textures),

    // The precomp seam: runs off the same descriptors the renderer binds, so what
    // gets loaded can't drift from what gets sampled.
    //
    // `width`/`height` come from the last shape op the tracking context saw, so a
    // shader fill on a raw `path`/`line` reports 0×0 — the same pre-existing
    // caveat every fill has there.
    prepare: (fill, tracker, width, height) => {
        for (const texture of fill.textures ?? []) {
            tracker.addImage(texture.src, { width, height });
        }
    },
};
