import { createScene, createRef, Rect, Fills, Adjustments, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/**
 * A 3D colour lookup table, unrolled into a `size × size × size` cube.
 *
 * Built rather than loaded so the scene has no fixture to keep in step: this is
 * a strong teal-and-orange grade — blues pushed cyan and cool, reds pushed warm,
 * with a mild S-curve on luma — which is obvious at a glance and impossible to
 * mistake for the source.
 *
 * Red-fastest, matching `LutEffect.table`.
 */
const SIZE = 17;

function buildCube(): Float32Array {
    const table = new Float32Array(SIZE * SIZE * SIZE * 3);
    const last = SIZE - 1;
    let i = 0;
    for (let b = 0; b < SIZE; b++) {
        for (let g = 0; g < SIZE; g++) {
            for (let r = 0; r < SIZE; r++) {
                const rn = r / last;
                const gn = g / last;
                const bn = b / last;
                // Contrast S-curve, then split-tone the ends apart.
                const s = (v: number) => v * v * (3 - 2 * v);
                table[i++] = Math.min(1, s(rn) * 1.1 + bn * 0.06);
                table[i++] = Math.min(1, s(gn) * 0.98);
                table[i++] = Math.min(1, s(bn) * 1.15 + gn * 0.05);
            }
        }
    }
    return table;
}

// One table for the whole scene: `LutEffect` compares it by reference, so a
// cube rebuilt per keyframe would re-upload the texture every frame.
const CUBE = buildCube();

/** {@link Adjustments.lut}: a measured colour cube dialled in from 0 to full. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const rect = createRef<Rect>();

    const graded = (amount: number) =>
        Fills.image('kingfisher.jpg', {
            fit: 'fill',
            preset: { adjustments: Adjustments.lut({ table: CUBE, size: SIZE, amount }) },
        });

    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect ref={rect} width={320} height={320} cornerRadius={24} fill={graded(0)} />
        </Rect>,
    );

    yield* rect().to({ fill: graded(1) }, 1.2, easeInOut('quad'));
    yield* holdTail(1.2);
});
