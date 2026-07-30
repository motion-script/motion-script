import type { EffectGeometry, EffectHandler, EffectResources } from "./handler";
import type { CanvasKit, Image as CKImage, Shader, Surface } from "@motion-script/canvaskit";
import { getOrCompileSkSL } from "../sksl-cache";
import { type TrailsEffect } from "@motion-script/core";

/**
 * Ceiling on retained taps. Each one is a full-surface texture (~8 MB at 1080p),
 * so this is a memory bound, not a quality one.
 */
const MAX_ECHOES = 16;

/**
 * One retained past frame.
 *
 * The `Surface` is kept alongside its snapshot rather than deleted immediately:
 * a GPU-backed `makeImageSnapshot` may share the surface's texture, so releasing
 * the surface early risks the image outliving its own pixels. Holding both costs
 * nothing extra — the texture is the memory — and makes the lifetime obvious.
 */
interface Tap {
    surface: Surface;
    image: CKImage;
    time: number;
}

interface History {
    taps: Tap[];
    lastPush: number;
}

/** Per-scope frame history, keyed by `EffectResources.scopeKey`. */
const histories = new Map<string, History>();

/**
 * Child-shader wrappers for the taps of the draw in flight.
 *
 * Freed at the *start* of the next `resources()` rather than at the end of
 * `makeShader`: a child shader has to outlive the `makeShaderWithChildren` call
 * that binds it, because the lens is not painted until after `makeShader`
 * returns. One batch is enough — the effect scope resolves a capture completely
 * (resources → makeShader → paint → delete lens) before the next one begins.
 */
let transient: Shader[] = [];

function releaseTransient(): void {
    for (const shader of transient) shader.delete();
    transient = [];
}

function releaseTap(tap: Tap): void {
    tap.image.delete();
    tap.surface.delete();
}

function clearHistory(history: History): void {
    for (const tap of history.taps) releaseTap(tap);
    history.taps = [];
}

/**
 * Copy `image` into a surface this handler owns.
 *
 * The snapshot handed to `resources` is borrowed — the render context deletes it
 * as soon as the draw finishes — so a trail that merely retained the reference
 * would be reading freed pixels a frame later. Drawing it into our own surface
 * is what makes the history outlive the frame that produced it.
 */
function copyImage(image: CKImage, ck: CanvasKit, res: EffectResources): Tap | null {
    const surface = res.makeSurface(image.width(), image.height());
    if (!surface) return null;

    const canvas = surface.getCanvas();
    canvas.clear(ck.TRANSPARENT);
    canvas.drawImage(image, 0, 0, null);

    const copy = surface.makeImageSnapshot();
    if (!copy) {
        surface.delete();
        return null;
    }
    return { surface, image: copy, time: res.time };
}

/**
 * Build the compositing shader for a given tap count and blend.
 *
 * The tap count is baked into the source because a shader's child count is fixed
 * at compile time; `getOrCompileSkSL` keys by source, so each (count, blend) pair
 * compiles once. This is also why `echoes` rounds in the effect's `lerp` rather
 * than interpolating — a fractional count would compile a new program per frame.
 *
 * Everything is premultiplied, which is what makes these blends one-liners:
 * `screen` is `a + b − a·b` channel-wise including alpha, and drawing a tap
 * *under* the accumulation is `acc + tap·(1 − acc.a)`.
 */
function source(count: number, blend: string): string {
    const children = Array.from({ length: count }, (_, i) => `uniform shader u_tap${i};`).join("\n");

    // Weight is applied to the premultiplied colour, so it scales alpha too —
    // i.e. it fades the tap out rather than making it transparent-but-bright.
    const combine = (expr: string) => {
        switch (blend) {
            case "add":
            case "plus":
                return `acc = acc + ${expr};`;
            case "normal":
            case "source-over":
                return `acc = acc + ${expr} * (1.0 - acc.a);`;
            default: // screen
                return `vec4 t = ${expr}; acc = acc + t - acc * t;`;
        }
    };

    const taps = Array.from({ length: count }, (_, i) => `
    {
        ${combine(`u_tap${i}.eval(fragCoord) * u_weights[${i}]`)}
    }`).join("");

    return `
uniform shader u_content;              // the node's content this frame
${children}
uniform float u_weights[${count}];     // per-tap alpha multiplier, decay^(n+1)

vec4 main(vec2 fragCoord) {
    vec4 acc = u_content.eval(fragCoord);
${taps}
    return acc;
}
`;
}

/**
 * Motion trails — the node composited with a trail of its own past frames.
 *
 * History is pushed on a **`delay` cadence rather than every frame**, so a tap is
 * genuinely `delay` seconds old whatever the frame rate, and memory is bounded by
 * `echoes` rather than by fps. Pushing every frame would hold 60 textures per
 * second of trail to draw six of them.
 *
 * A repeated draw of the same timestamp does not push (the exporter may draw a
 * frame more than once), and a timestamp going *backwards* clears the history —
 * a backwards scrub has no valid trail, and refilling is the honest answer.
 */
export const trailsEffectHandler: EffectHandler<TrailsEffect> = {
    type: "trails",
    // The taps are full-surface snapshots in the same device space as the
    // content, sampled at fragCoord — so anything outside is genuinely empty.
    sampling: { tileMode: "decal", filterMode: "linear" },
    // Foreground only: a trail is made of what the *node* drew. The backdrop is
    // not this node's history, and echoing it would smear the whole scene.
    handles: (_effect, target) => target === "foreground",

    resources(effect, ck, res) {
        // The previous draw's lens has been painted and deleted by now, so its
        // children are finally safe to free.
        releaseTransient();

        const echoes = Math.max(0, Math.min(MAX_ECHOES, Math.round(effect.echoes)));
        if (echoes === 0) return null;

        let history = histories.get(res.scopeKey);
        if (!history) {
            history = { taps: [], lastPush: Number.NEGATIVE_INFINITY };
            histories.set(res.scopeKey, history);
        }

        // Scrubbed backwards (or the node restarted) — the retained frames are
        // from a future that no longer leads here.
        if (res.time < history.lastPush) {
            clearHistory(history);
            history.lastPush = Number.NEGATIVE_INFINITY;
        }

        // Selected *before* this frame is pushed, so the taps are strictly past
        // frames. Including the frame being drawn would composite the node onto
        // itself — no offset, just a brightened copy — which is what a trail
        // looks like when it is subtly wrong.
        const taps = history.taps.slice(0, echoes);

        const delay = Math.max(effect.delay, 1e-4);
        const due = res.time - history.lastPush >= delay;
        if (res.contentSnapshot && due) {
            const tap = copyImage(res.contentSnapshot, ck, res);
            if (tap) {
                history.taps.unshift(tap);          // newest first
                history.lastPush = res.time;
            }
        }

        // Bounded at `echoes + 1`, not `echoes`: `taps` was sliced before the
        // push, so the oldest entry it holds sits at index `echoes` once the new
        // frame is unshifted on. Trimming to `echoes` would free a tap this very
        // frame is about to wrap in a shader — which CanvasKit reports as
        // "cannot pass deleted object", several frames into an export.
        //
        // A tween down still releases the surplus promptly rather than holding
        // it against a possible tween back up.
        while (history.taps.length > echoes + 1) {
            const dropped = history.taps.pop();
            if (dropped) releaseTap(dropped);
        }

        if (taps.length === 0) return null;   // nothing behind us yet

        transient = taps.map((tap) =>
            tap.image.makeShaderOptions(
                ck.TileMode.Decal, ck.TileMode.Decal, ck.FilterMode.Linear, ck.MipmapMode.None,
            ),
        );
        return transient;
    },

    makeShader(effect, ck, content, _geom: EffectGeometry, extra) {
        const taps = extra ?? [];
        if (taps.length === 0) return null;

        const runtimeEffect = getOrCompileSkSL(source(taps.length, effect.blend), ck);
        if (!runtimeEffect) return null;

        const decay = Math.max(0, Math.min(1, effect.decay));
        const weights = taps.map((_, i) => decay ** (i + 1));

        return runtimeEffect.makeShaderWithChildren(weights, [content, ...taps]);
    },

    dispose() {
        releaseTransient();
        for (const history of histories.values()) clearHistory(history);
        histories.clear();
    },
};
