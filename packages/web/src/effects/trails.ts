import type { EffectGeometry, EffectHandler } from "./handler";
import { getOrCompileSkSL } from "../sksl-cache";
import { type TrailsEffect } from "@motion-script/core";

/** Ceiling on taps. Each is a full re-sample of the content, so this bounds cost. */
const MAX_ECHOES = 16;

/**
 * Below this much total displacement (device px) there is no trail to draw — the
 * taps would land on top of the content and merely brighten it, which is worse
 * than the no-op a static node should get.
 */
const MIN_TRAVEL = 1;

/**
 * Build the trail shader for a given tap count and blend.
 *
 * Each tap reconstructs where the node *was* `delay × n` seconds ago by undoing
 * that much of its sampled motion, then samples the current content there. To
 * draw the content translated by `−v·dt` you sample at `+v·dt`, and likewise the
 * rotation is undone by rotating the sample coordinate the *other* way — which is
 * why both signs below look inverted relative to the motion.
 *
 * The tap count is baked in because a shader's loop bound is fixed at compile
 * time; `getOrCompileSkSL` keys by source, so each (count, blend) pair compiles
 * once. That is also why `echoes` rounds in the effect's `lerp`.
 *
 * Everything is premultiplied, which makes the blends one-liners: `screen` is
 * `a + b − a·b` channel-wise including alpha, and drawing a tap *under* the
 * accumulation is `acc + tap·(1 − acc.a)`.
 */
function source(count: number, blend: string): string {
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
        float dtn = u_delay * ${(i + 1).toFixed(1)};
        vec2 q = fragCoord + u_velocity * dtn;      // undo the translation
        vec2 d = q - u_center;
        float a = u_angular * dtn;                  // undo the rotation
        float c = cos(a);
        float s = sin(a);
        vec2 p = u_center + vec2(d.x * c - d.y * s, d.x * s + d.y * c);
        ${combine(`u_content.eval(p) * u_weights[${i}]`)}
    }`).join("");

    return `
uniform shader u_content;            // the node's content this frame
uniform vec2  u_center;              // node centre, device px
uniform vec2  u_velocity;            // sampled velocity, device px per second
uniform float u_angular;             // sampled angular velocity, radians per second
uniform float u_delay;               // seconds between taps
uniform float u_weights[${count}];   // per-tap alpha multiplier, decay^(n+1)

vec4 main(vec2 fragCoord) {
    vec4 acc = u_content.eval(fragCoord);
${taps}
    return acc;
}
`;
}

/**
 * Motion trails — the node echoed along its own motion.
 *
 * Derived from the node's **sampled velocity**, exactly as `motionBlur` is,
 * rather than from a buffer of past frames. That choice is what makes the effect
 * a pure function of the playhead: `NodeRenderState.velocity` is sampled on every
 * *advanced* frame, not merely every rendered one (see `Node`'s motion-sampling
 * notes), so it is already correct after a backward scrub — which is precisely
 * the case a frame-history implementation cannot serve, because seeking replays
 * the generator without drawing the frames it passes through.
 *
 * The trade is that a tap extrapolates along the current velocity rather than
 * following the node's actual past path, so a trail spanning a sharp curve
 * straightens. `motionBlur` makes the same approximation over one frame; here it
 * spans `echoes × delay`, so it is more visible. Keep the trail short relative to
 * how fast the path turns.
 */
export const trailsEffectHandler: EffectHandler<TrailsEffect> = {
    type: "trails",
    // Decal: a tap displaced past the node's own content is genuinely empty, not
    // a smeared edge pixel repeated down the trail.
    sampling: { tileMode: "decal", filterMode: "linear" },
    // Foreground only: a trail is made of what the *node* drew. The backdrop is
    // not this node's motion, and echoing it would smear the whole scene.
    handles: (_effect, target) => target === "foreground",

    makeShader(effect, ck, content, geom: EffectGeometry) {
        const echoes = Math.max(0, Math.min(MAX_ECHOES, Math.round(effect.echoes)));
        if (echoes === 0 || geom.width <= 0 || geom.height <= 0) return null;

        const delay = Math.max(effect.delay, 1e-4);
        // px/sec are authored in logical space; the shader runs in device space.
        const vx = geom.velocity.x * geom.scale;
        const vy = geom.velocity.y * geom.scale;
        const angular = (geom.angularVelocity * Math.PI) / 180;

        // A node that is not moving has no trail. Without this the taps stack on
        // the content and screen-blend it toward white — a static node would
        // silently glow instead of rendering normally.
        const travel = Math.hypot(vx, vy) * delay * echoes;
        const swept = Math.abs(angular) * delay * echoes * Math.max(geom.width, geom.height) / 2;
        if (travel + swept < MIN_TRAVEL) return null;

        const runtimeEffect = getOrCompileSkSL(source(echoes, effect.blend), ck);
        if (!runtimeEffect) return null;

        const decay = Math.max(0, Math.min(1, effect.decay));
        const weights = Array.from({ length: echoes }, (_, i) => decay ** (i + 1));

        return runtimeEffect.makeShaderWithChildren(
            [
                geom.centerX, geom.centerY,
                vx, vy,
                angular,
                delay,
                ...weights,
            ],
            [content],
        );
    },
};
