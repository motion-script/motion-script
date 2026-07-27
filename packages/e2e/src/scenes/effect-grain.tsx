import { createScene, createRef, Rect, Fills, Effects, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/**
 * {@link Effects.grain}: film noise builds over a smooth gradient as `amount` ramps up.
 *
 * `animated` is deliberately left off — the field is then a pure function of the
 * pixel and the seed, so the frame is byte-identical on every render.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const card = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} group={'stack'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={card}
                width={420}
                height={280}
                cornerRadius={20}
                fill={Fills.linearGradient(['#20263a', '#dfe6ff'])}
                effects={Effects.grain({ amount: 0, size: 2 })}
            />
        </Rect>,
    );

    yield* card().to({ effects: Effects.grain({ amount: 0.6, size: 2 }) }, 1.2, easeInOut('quad'));
    yield* holdTail(1.2);
});
