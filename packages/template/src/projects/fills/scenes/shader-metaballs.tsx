import { createScene, createRef, Reference, Rect, Text, Fills, easeInOut, parallel } from "motion-script";

const STAGE = '#0D0F15';
const HEADING = '#C9D2E4';

/**
 * Three discs blended by a smooth minimum, so they fuse into one surface as
 * `u_merge` rises.
 *
 * `coords: 'centered'` is what makes this tractable: the origin is the card's
 * centre and **pixels are square** (both axes scale by the height), so a disc of
 * radius 0.18 is round without any correction. `u_aspect` — a built-in the
 * renderer fills in because the source declares it — says how far the left and
 * right edges are, `±aspect/2`, which is what lets the centres be authored as
 * fractions of the card and still reach its corners.
 */
const METABALLS = `
uniform float u_aspect;   // built-in: width / height
uniform float u_merge;    // 0 = three discs, 1 = one blob
uniform vec2  u_p0;
uniform vec2  u_p1;
uniform vec2  u_p2;
uniform vec4  u_tint;

// Polynomial smooth minimum: the standard implicit-surface blend. k is the
// radius over which two surfaces notice each other.
float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}

float field(vec2 uv, float k) {
    vec2 wide = vec2(u_aspect, 1.0);
    float d = length(uv - u_p0 * wide) - 0.20;
    d = smin(d, length(uv - u_p1 * wide) - 0.16, k);
    d = smin(d, length(uv - u_p2 * wide) - 0.13, k);
    return d;
}

vec4 main(vec2 uv) {
    float k = 0.015 + u_merge * 0.34;
    float d = field(uv, k);

    // A hard edge, which is the whole difference from a noise field: the surface
    // is where d crosses zero, not a value ramped through a gradient.
    float edge = 1.0 - smoothstep(0.0, 0.008, d);
    float core = 1.0 - smoothstep(-0.15, -0.02, d);

    vec4 c = mix(u_tint, vec4(1.0, 1.0, 1.0, 1.0), core * 0.5);
    float a = edge * c.a;
    return vec4(c.rgb * a, a);
}`;

const CARDS = [
    {
        label: 'apart → fused',
        tint: [0.41, 0.56, 0.87, 1],
        from: { u_p0: [-0.34, -0.16], u_p1: [0.30, -0.22], u_p2: [0.02, 0.28] },
        to: { u_p0: [-0.10, -0.04], u_p1: [0.11, -0.07], u_p2: [0.01, 0.10] },
    },
    {
        label: 'orbiting',
        tint: [0.91, 0.38, 0.49, 1],
        from: { u_p0: [-0.30, 0.20], u_p1: [0.30, 0.20], u_p2: [0.00, -0.26] },
        to: { u_p0: [0.24, -0.18], u_p1: [-0.06, 0.24], u_p2: [-0.20, -0.14] },
    },
    {
        label: 'sweeping in',
        tint: [0.96, 0.76, 0.42, 1],
        from: { u_p0: [-0.44, 0.00], u_p1: [0.00, 0.00], u_p2: [0.44, 0.00] },
        to: { u_p0: [-0.12, 0.10], u_p1: [0.02, -0.12], u_p2: [0.15, 0.09] },
    },
];

/**
 * A custom shader fill: metaballs.
 *
 * The one thing here that is unreachable by stacking built-in fills at any opacity
 * is the **topology change**. `u_merge` widens the smooth-minimum blend radius, so
 * three separate discs become one continuous blob — three shapes becoming one is
 * not something a gradient, an image or a noise field can be tuned into.
 *
 * It is also the clearest case for uniforms interpolating component-wise: the
 * three centres are `vec2`s, and each axis tweens independently while the merge
 * radius grows underneath them.
 */
export default createScene(function* (stage) {
    stage.set({ fill: STAGE });

    const cards: Reference<Rect>[] = CARDS.map(() => createRef<Rect>());

    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'vertical'} padding={64} gap={28}>
            <Text text={'Custom shader — metaballs'} fontSize={44} fill={HEADING} width={'fill'} textAlign={'center'} />
            <Rect width={'fill'} height={'fill'} flow={'horizontal'} gap={28}>
                {CARDS.map(({ label, tint, from }, i) => (
                    <Rect width={'fill'} height={'fill'} flow={'vertical'} gap={12}>
                        <Rect
                            ref={cards[i]}
                            width={'fill'} height={'fill'} cornerRadius={16} clip={true}
                            fill={['#10131b', Fills.shader(METABALLS, {
                                coords: 'centered',
                                uniforms: { u_merge: 0, u_tint: tint, ...from },
                            })]}
                        />
                        <Text text={label} fontSize={26} fill={HEADING} width={'fill'} textAlign={'center'} />
                    </Rect>
                ))}
            </Rect>
        </Rect>
    );

    yield* parallel(...cards.map((card, i) =>
        card().to({
            fill: ['#10131b', Fills.shader(METABALLS, {
                coords: 'centered',
                uniforms: { u_merge: 1, u_tint: CARDS[i].tint, ...CARDS[i].to },
            })],
        }, 3, easeInOut('quad'))
    ));
});
