import { createScene, createRef, Rect, Text, Effects, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** {@link Effects.sharpen}: edge contrast rises (and finally haloes) as `amount` ramps up. */
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
                fill={'card'}
                group={'stack'}
                align={{ x: 0, y: 0 }}
                effects={Effects.sharpen({ amount: 0, radius: 3 })}
            >
                <Text text={'SHARP'} fontFamily={'Inter'} fontWeight={700} fontSize={72} fill={'primary'} />
            </Rect>
        </Rect>,
    );

    yield* card().to({ effects: Effects.sharpen({ amount: 3, radius: 3 }) }, 1.2, easeInOut('quad'));
    yield* holdTail(1.2);
});
