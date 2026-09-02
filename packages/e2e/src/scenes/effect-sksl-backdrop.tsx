import { createRef, Rect, Grid, Effects, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/**
 * {@link Effects.sksl} in backdrop mode: a custom shader resamples `u_backdrop` (the
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

const lens = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
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
            center={() => stage.canvas.center}
            effects={Effects.sksl({ shader: RIPPLE_SHADER, mode: 'backdrop', uniforms: [
                { name: 'u_resolution', value: [LENS_WIDTH, LENS_HEIGHT] },
                { name: 'u_amount', value: 0 },
            ] })}
        />,
    );
}, [
    () => lens().to(
        {
            effects: Effects.sksl({ shader: RIPPLE_SHADER, mode: 'backdrop', uniforms: [
                { name: 'u_resolution', value: [LENS_WIDTH, LENS_HEIGHT] },
                { name: 'u_amount', value: 18 },
            ] }) },
        1.4,
        easeInOut('quad'),
    ),
    holdTail(1.4),
]);
