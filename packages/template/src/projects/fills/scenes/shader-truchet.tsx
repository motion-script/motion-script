import { createScene, createRef, Reference, Rect, Text, Fills, easeInOut, parallel } from "motion-script";

const STAGE = '#0D0F15';
const HEADING = '#C9D2E4';

/**
 * Truchet tiling: each cell carries a pair of quarter arcs, and a per-cell hash
 * picks which diagonal they sit on. Neighbouring arcs meet at the cell edges,
 * which is what makes the whole grid read as one continuous maze.
 *
 * `coords: 'local'` puts `fragCoord` in shape-local logical px, so `u_pitch` is an
 * **absolute tile size** — the direct analogue of `Fills.stripe`'s `gap`. A card
 * twice as wide gets twice as many tiles rather than bigger ones, which is the
 * opposite of what `normalized` would do.
 *
 * `u_seed` is an `int`, so it exercises the marshaller's integer path: CanvasKit
 * carries an integer uniform's int32 bit pattern in the same float buffer, which
 * only works if it is written through an `Int32Array` view.
 */
const TRUCHET = `
uniform float u_pitch;    // tile size, in shape-local px
uniform float u_rot;      // 0..1 sweeps every tile through a quarter turn
uniform float u_weight;   // stroke weight, in px
uniform int   u_seed;
uniform vec4  u_ink;

float hash(vec2 cell) {
    vec2 p = cell + float(u_seed) * 0.1379;
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec4 main(vec2 px) {
    float pitch = max(u_pitch, 2.0);
    vec2 g = px / pitch;
    vec2 cell = floor(g);
    vec2 f = fract(g);

    // Which diagonal this tile's arcs sit on. This is the truchet: a coin flip per
    // cell, and the arcs still meet at the edges either way.
    float flip = step(0.5, hash(cell));
    // Which way it turns, drawn from an independent flip so the sweep re-wires the
    // maze into another random one rather than into its mirror.
    float dir = step(0.5, hash(cell + 17.0)) * 2.0 - 1.0;

    // Rotate about the cell centre rather than mirroring: a partial mirror
    // collapses the tile to a line halfway through, whereas a rotation is
    // well-formed at every value of u_rot.
    float ang = (flip + u_rot * dir) * 1.5707963;
    float cs = cos(ang);
    float sn = sin(ang);
    vec2 q = f - 0.5;
    vec2 r = vec2(q.x * cs - q.y * sn, q.x * sn + q.y * cs) + 0.5;

    // The two quarter arcs, centred on opposite corners of the tile.
    float d = min(abs(length(r) - 0.5), abs(length(r - vec2(1.0, 1.0)) - 0.5));

    // Both the stroke weight and its feather are authored in px, so they hold
    // their apparent thickness whatever the pitch is.
    float w = (u_weight * 0.5) / pitch;
    float aa = 1.4 / pitch;
    float a = (1.0 - smoothstep(w, w + aa, d)) * u_ink.a;
    return vec4(u_ink.rgb * a, a);
}`;

const CARDS = [
    { pitch: 44, label: '44px pitch', seed: 3, ink: [0.41, 0.56, 0.87, 1] },
    { pitch: 72, label: '72px pitch', seed: 11, ink: [0.50, 0.82, 0.76, 1] },
    { pitch: 116, label: '116px pitch', seed: 29, ink: [0.96, 0.76, 0.42, 1] },
];

/**
 * A custom shader fill: truchet tiles.
 *
 * `u_rot` is the tweened knob because a tiling pattern's only interesting motion
 * is *within* the cell — panning the grid merely slides it past the window, while
 * sweeping each tile through a quarter turn re-wires the maze in place. The same
 * distinction the fractal-noise fill draws between `offset` (travel through the
 * field) and `seed` (swap to a different field).
 *
 * The arcs deliberately break continuity with their neighbours mid-sweep and
 * re-form into a different maze at the end: the rotation is about each cell's own
 * centre, so the joins only line up at the quarter-turn endpoints.
 */
export default createScene(function* (stage) {
    stage.set({ fill: STAGE });

    const cards: Reference<Rect>[] = CARDS.map(() => createRef<Rect>());

    const fillFor = (i: number, rot: number) => [
        '#10131b',
        Fills.shader(TRUCHET, {
            coords: 'local',
            uniforms: {
                u_pitch: CARDS[i].pitch,
                u_rot: rot,
                u_weight: 5,
                u_seed: CARDS[i].seed,
                u_ink: CARDS[i].ink,
            },
        }),
    ];

    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'vertical'} padding={64} gap={28}>
            <Text text={'Custom shader — truchet tiles'} fontSize={44} fill={HEADING} width={'fill'} textAlign={'center'} />
            <Rect width={'fill'} height={'fill'} flow={'horizontal'} gap={28}>
                {CARDS.map(({ label }, i) => (
                    <Rect width={'fill'} height={'fill'} flow={'vertical'} gap={12}>
                        <Rect
                            ref={cards[i]}
                            width={'fill'} height={'fill'} cornerRadius={16} clip={true}
                            fill={fillFor(i, 0)}
                        />
                        <Text text={label} fontSize={26} fill={HEADING} width={'fill'} textAlign={'center'} />
                    </Rect>
                ))}
            </Rect>
        </Rect>
    );

    yield* parallel(...cards.map((card, i) =>
        card().to({ fill: fillFor(i, 1) }, 3, easeInOut('quad'))
    ));
});
