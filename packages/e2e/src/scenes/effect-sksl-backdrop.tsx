import { createScene, createRef, Rect, Grid, Effects, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/**
 * {@link Effects.skslBackdrop}: a custom shader resamples `u_backdrop` (the
 * canvas content beneath the node) with a horizontal ripple whose amplitude
 * grows, distorting the checkerboard seen through the lens.
 */
const LENS_WIDTH = 300;
const LENS_HEIGHT = 220;

const RIPPLE_SHADER = `
uniform shader u_backdrop;
uniform float2 u_resolution;
uniform float u_amount;

half4 main(float2 coord) {
    float2 uv = coord / u_resolution;
    float wave = sin(uv.y * 30.0) * u_amount;
    return u_backdrop.eval(coord + float2(wave, 0.0));
}
`;

export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const lens = createRef<Rect>();
    stage.add(
        <Grid width={'fill'} height={'fill'} columns={6} gap={2} padding={20}>
            <Rect width={'fill'} height={'fill'} fill={'#6990dd'} />
            <Rect width={'fill'} height={'fill'} fill={'#e8617c'} />
            <Rect width={'fill'} height={'fill'} fill={'#f2c94c'} />
            <Rect width={'fill'} height={'fill'} fill={'#6990dd'} />
            <Rect width={'fill'} height={'fill'} fill={'#e8617c'} />
            <Rect width={'fill'} height={'fill'} fill={'#f2c94c'} />
            <Rect width={'fill'} height={'fill'} fill={'#6990dd'} />
            <Rect width={'fill'} height={'fill'} fill={'#e8617c'} />
            <Rect width={'fill'} height={'fill'} fill={'#f2c94c'} />
            <Rect width={'fill'} height={'fill'} fill={'#6990dd'} />
            <Rect width={'fill'} height={'fill'} fill={'#e8617c'} />
            <Rect width={'fill'} height={'fill'} fill={'#f2c94c'} />
        </Grid>,
    );
    stage.add(
        <Rect
            ref={lens}
            width={LENS_WIDTH}
            height={LENS_HEIGHT}
            cornerRadius={20}
            stroke={{ weight: 4, fill: '#f4f6ff' }}
            center={() => stage.root.center}
            effects={Effects.skslBackdrop(RIPPLE_SHADER, [
                { name: 'u_resolution', value: [LENS_WIDTH, LENS_HEIGHT] },
                { name: 'u_amount', value: 0 },
            ])}
        />,
    );

    yield* lens().to(
        {
            effects: Effects.skslBackdrop(RIPPLE_SHADER, [
                { name: 'u_resolution', value: [LENS_WIDTH, LENS_HEIGHT] },
                { name: 'u_amount', value: 18 },
            ]),
        },
        1.4,
        easeInOut('quad'),
    );
    yield* holdTail(1.4);
});
