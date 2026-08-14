import { createScene, createRef, Rect, Text, Effects, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** {@link Effects.streak}: a bright pass smeared along one axis, unlike bloom's even halo. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const card = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={card}
                width={520}
                height={300}
                cornerRadius={20}
                fill={'#05070d'}
                clip={true}
                flow={'freeform'}
                align={{ x: 0, y: 0 }}
                effects={Effects.streak({ intensity: 0, threshold: 0.4, length: 220 })}
            >
                <Text text={'GLARE'} fontFamily={'Inter'} fontWeight={800} fontSize={64} fill={'#fff3d0'} />
            </Rect>
        </Rect>,
    );

    yield* card().to(
        { effects: Effects.streak({ intensity: 2.4, threshold: 0.4, length: 220 }) },
        1.2,
        easeInOut('quad'),
    );
    yield* holdTail(1.2);
});
