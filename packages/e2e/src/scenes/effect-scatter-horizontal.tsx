import { createScene, createRef, Rect, Text, Effects, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** {@link Effects.scatter} with `axis: 'x'`: pixels jitter randomly only along the x-axis, smearing into vertical streaks. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const card = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={card}
                width={360}
                height={240}
                cornerRadius={20}
                fill={'card'}
                flow={'freeform'}
                align={{ x: 0, y: 0 }}
                effects={Effects.scatter({ strength: 0, axis: 'x' })}
            >
                <Text text={'NOISE'} fontFamily={'Inter'} fontWeight={800} fontSize={56} fill={'primary'} />
            </Rect>
        </Rect>,
    );

    yield* card().to({ effects: Effects.scatter({ strength: 24, axis: 'x' }) }, 1.2, easeInOut('quad'));
    yield* holdTail(1.2);
});
