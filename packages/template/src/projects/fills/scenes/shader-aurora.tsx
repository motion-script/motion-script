import { createScene, createRef, Reference, Rect, Text, Fills, easeInOut, parallel } from "motion-script";

const STAGE = '#0D0F15';
const HEADING = '#C9D2E4';

/**
 * One source per band count.
 *
 * SkSL wants a compile-time loop bound, so the band count is baked in rather than
 * passed as a uniform — the same reason the fractal-noise fill bakes its octave
 * count. Generated at module scope, so this is three programs compiled once each,
 * not three per frame: `getOrCompileSkSL` keys by source text.
 */
const auroraSource = (bands: number) => `
uniform float u_warp;    // 0..1, how far each band bends. 0 is flat stripes.
uniform float u_phase;   // travels along the bands
uniform vec4  u_lo;
uniform vec4  u_hi;

vec4 main(vec2 uv) {
    // Everything is measured in band spacing, so the look holds at any band count
    // rather than saturating into a solid card as they crowd together.
    float spacing = 1.0 / float(${bands} + 1);

    float glow = 0.0;
    for (int i = 0; i < ${bands}; i++) {
        float fi = float(i);
        float centre = spacing * (fi + 1.0);
        // Just under half a spacing at full warp, so the bands ripple freely but
        // stay separate ribbons instead of weaving into a lattice.
        float bend = sin(uv.x * (3.0 + fi * 1.6) + u_phase + fi * 1.7) * u_warp * spacing * 0.45;
        // Tight relative to the spacing: with a wide falloff the neighbouring
        // tails sum past 1 everywhere and the card goes solid.
        glow += exp(-abs(uv.y + bend - centre) / (spacing * 0.16));
    }
    glow = clamp(glow, 0.0, 1.0);

    vec4 c = mix(u_lo, u_hi, glow);
    // Premultiplied, and deliberately without folding the layer's opacity in —
    // that is already on the paint.
    return vec4(c.rgb * c.a, c.a);
}`;

const CARDS = [
    { bands: 3, label: '3 bands', lo: [0.04, 0.05, 0.08, 1], hi: [0.41, 0.56, 0.87, 1] },
    { bands: 5, label: '5 bands', lo: [0.05, 0.04, 0.07, 1], hi: [0.91, 0.38, 0.49, 1] },
    { bands: 8, label: '8 bands', lo: [0.02, 0.06, 0.06, 1], hi: [0.50, 0.82, 0.76, 1] },
];

/**
 * A custom shader fill: aurora bands.
 *
 * What this shows that no built-in fill can is the *colour mapping*. `fractalNoise`
 * gives you a scalar field and a ramp over it; here the shader decides what every
 * pixel becomes, so the bands can glow additively and overlap without any of that
 * being a fill option.
 *
 * `u_warp` is the tweened knob because it is the look's neutral setting: at 0 the
 * bands are flat horizontal stripes, so the whole aurora ramps up *out of*
 * nothing. `u_phase` travels along them at the same time — both are uniforms, so
 * neither costs a recompile, which is the entire reason the source is a module
 * constant and everything that moves is a uniform.
 */
export default createScene(function* (stage) {
    stage.set({ fill: STAGE });

    const cards: Reference<Rect>[] = CARDS.map(() => createRef<Rect>());

    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'vertical'} padding={64} gap={28}>
            <Text text={'Custom shader — aurora'} fontSize={44} fill={HEADING} width={'fill'} textAlign={'center'} />
            <Rect width={'fill'} height={'fill'} flow={'horizontal'} gap={28}>
                {CARDS.map(({ bands, label, lo, hi }, i) => (
                    <Rect width={'fill'} height={'fill'} flow={'vertical'} gap={12}>
                        <Rect
                            ref={cards[i]}
                            width={'fill'} height={'fill'} cornerRadius={16} clip={true}
                            fill={Fills.shader(auroraSource(bands), {
                                uniforms: { u_warp: 0.02, u_phase: 0, u_lo: lo, u_hi: hi },
                            })}
                        />
                        <Text text={label} fontSize={26} fill={HEADING} width={'fill'} textAlign={'center'} />
                    </Rect>
                ))}
            </Rect>
        </Rect>
    );

    yield* parallel(...cards.map((card, i) =>
        card().to({
            fill: Fills.shader(auroraSource(CARDS[i].bands), {
                uniforms: { u_warp: 1, u_phase: 2.4, u_lo: CARDS[i].lo, u_hi: CARDS[i].hi },
            }),
        }, 3, easeInOut('quad'))
    ));
});
