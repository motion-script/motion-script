import { createScene, createRef, Rect, Fills, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/**
 * A ring whose radius is driven by one tweened uniform.
 *
 * Kept deliberately narrow so it can only fail for one reason. It declares
 * `u_aspect` — a built-in the renderer fills in — and `u_amount`, and nothing
 * else: no `u_time` (which would confound a clock regression with a marshalling
 * one), no `u_scale` (which folds in pixel ratio and camera zoom, so it renders
 * differently at export scale), no textures, no `blend`, no `opacity` tween, no
 * stroke and no shadow. Geometry and colour are constants, so the only thing that
 * differs across the first/mid/last frames is the uniform.
 *
 * `u_aspect` earns its place by being separately diagnosable: the card is 3:2, so
 * a broken aspect built-in shows up as an ellipse in *all three* frames, which is
 * a different signature from a ring that fails to grow.
 */
const RING = `
uniform float u_aspect;
uniform float u_amount;

vec4 main(vec2 uv) {
    // Square up the horizontal axis, so the ring is a circle on a 3:2 card.
    vec2 p = vec2((uv.x - 0.5) * u_aspect, uv.y - 0.5);
    float r = 0.06 + u_amount * 0.30;
    float d = abs(length(p) - r);
    float a = 1.0 - smoothstep(0.012, 0.030, d);
    // Premultiplied, and without folding the layer's opacity in.
    vec3 c = vec3(0.41, 0.56, 0.87);
    return vec4(c * a, a);
}`;

/** {@link Fills.shader}: a custom SkSL fill with one tweened uniform. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const card = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} group={'stack'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={card}
                width={360}
                height={240}
                cornerRadius={20}
                clip={true}
                fill={['card', Fills.shader(RING, { uniforms: { u_amount: 0 } })]}
            />
        </Rect>,
    );

    yield* card().to(
        { fill: ['card', Fills.shader(RING, { uniforms: { u_amount: 1 } })] },
        1.4,
        easeInOut('quad'),
    );
    yield* holdTail(1.4);
});
