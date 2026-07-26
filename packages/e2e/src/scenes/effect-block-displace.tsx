import { createScene, createRef, Rect, Effects, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/**
 * {@link Effects.blockDisplace}: horizontal bands tear sideways as `amount` ramps up.
 *
 * `seed` is held fixed so the displacement is a pure function of the band index —
 * the frame renders identically every time.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const card = createRef<Rect>();
    const shape = { size: 24, density: 0.6, seed: 3 };
    stage.add(
        <Rect width={'fill'} height={'fill'} group={'stack'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={card}
                width={420}
                height={280}
                cornerRadius={20}
                fill={'card'}
                group={'row'}
                gap={16}
                padding={20}
                effects={Effects.blockDisplace({ amount: 0, ...shape })}
            >
                <Rect width={'fill'} height={'fill'} cornerRadius={12} fill={'#6990dd'} />
                <Rect width={'fill'} height={'fill'} cornerRadius={12} fill={'#e8617c'} />
                <Rect width={'fill'} height={'fill'} cornerRadius={12} fill={'#f2c94c'} />
            </Rect>
        </Rect>,
    );

    yield* card().to({ effects: Effects.blockDisplace({ amount: 70, ...shape }) }, 1.2, easeInOut('quad'));
    yield* holdTail(1.2);
});
