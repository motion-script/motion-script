import { createScene, createRef, Rect, Text, Effects, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** {@link Effects.bloom}: bright areas bleed soft light outward as `intensity` ramps up. */
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
                effects={Effects.bloom(0.4, 20, 0)}
            >
                <Text text={'BLOOM'} fontFamily={'Inter'} fontWeight={800} fontSize={56} fill={'#f4f6ff'} />
            </Rect>
        </Rect>,
    );

    yield* card().to({ effects: Effects.bloom(0.4, 20, 2.5) }, 1.2, easeInOut('quad'));
    yield* holdTail(1.2);
});
