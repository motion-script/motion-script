import { createScene, createRef, Rect, Text, Effects, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** {@link Effects.scatter} with `direction: 'vertical'`: pixels jitter randomly only along the y-axis, smearing into horizontal streaks. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const card = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} group={'stack'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={card}
                width={360}
                height={240}
                cornerRadius={20}
                fill={'card'}
                group={'stack'}
                align={{ x: 0, y: 0 }}
                effects={Effects.scatter(0, 'vertical')}
            >
                <Text text={'NOISE'} fontFamily={'Inter'} fontWeight={800} fontSize={56} fill={'primary'} />
            </Rect>
        </Rect>,
    );

    yield* card().to({ effects: Effects.scatter(24, 'vertical') }, 1.2, easeInOut('quad'));
    yield* holdTail(1.2);
});
