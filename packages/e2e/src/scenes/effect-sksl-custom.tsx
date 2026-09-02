import { createRef, Rect, Effects, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/**
 * {@link Effects.sksl} in foreground mode: a custom shader generates a colored glow from
 * position and a `u_amount` uniform, screen-blended onto the node's own layer
 * as it ramps from invisible to fully bright.
 */
const CARD_WIDTH = 360;
const CARD_HEIGHT = 240;

const GLOW_SHADER = `
uniform float2 u_resolution;
uniform float u_amount;

half4 main(float2 coord) {
    float2 uv = coord / u_resolution - 0.5;
    float d = length(uv);
    float glow = (1.0 - smoothstep(0.0, 0.6, d)) * u_amount;
    return half4(glow, glow * 0.6, glow * 0.9, glow);
}
`;

const card = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={card}
                width={CARD_WIDTH}
                height={CARD_HEIGHT}
                cornerRadius={20}
                fill={'card'}
                effects={Effects.sksl({ shader: GLOW_SHADER, uniforms: [
                    { name: 'u_resolution', value: [CARD_WIDTH, CARD_HEIGHT] },
                    { name: 'u_amount', value: 0 },
                ] })}
            />
        </Rect>,
    );
}, [
    () => card().to(
        {
            effects: Effects.sksl({ shader: GLOW_SHADER, uniforms: [
                { name: 'u_resolution', value: [CARD_WIDTH, CARD_HEIGHT] },
                { name: 'u_amount', value: 1.2 },
            ] }) },
        1.2,
        easeInOut('quad'),
    ),
    holdTail(1.2),
]);
