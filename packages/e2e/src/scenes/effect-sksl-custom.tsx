import { createScene, createRef, Rect, Effects, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/**
 * {@link Effects.skslLayer}: a custom shader generates a colored glow from
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

export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const card = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} group={'stack'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={card}
                width={CARD_WIDTH}
                height={CARD_HEIGHT}
                cornerRadius={20}
                fill={'card'}
                effects={Effects.skslLayer(GLOW_SHADER, [
                    { name: 'u_resolution', value: [CARD_WIDTH, CARD_HEIGHT] },
                    { name: 'u_amount', value: 0 },
                ])}
            />
        </Rect>,
    );

    yield* card().to(
        {
            effects: Effects.skslLayer(GLOW_SHADER, [
                { name: 'u_resolution', value: [CARD_WIDTH, CARD_HEIGHT] },
                { name: 'u_amount', value: 1.2 },
            ]),
        },
        1.2,
        easeInOut('quad'),
    );
    yield* holdTail(1.2);
});
