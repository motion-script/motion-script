import { createScene, createRef, Rect, Text, Effects, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** {@link Effects.chromaticAberration}: red/blue channel fringing grows as `amount` ramps up, mimicking lens dispersion. */
export default createScene(function* (stage) {
    stage.set({ fill: '#0d0f15' });
    const card = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} group={'stack'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={card}
                width={360}
                height={240}
                cornerRadius={20}
                fill={'#0d0f15'}
                group={'stack'}
                align={{ x: 0, y: 0 }}
                effects={Effects.chromaticAberration(0, 0)}
            >
                <Text text={'FRINGE'} fontFamily={'Inter'} fontWeight={800} fontSize={56} fill={'#f4f6ff'} />
            </Rect>
        </Rect>,
    );

    yield* card().to({ effects: Effects.chromaticAberration(14, 0) }, 1.2, easeInOut('quad'));
    yield* holdTail(1.2);
});
