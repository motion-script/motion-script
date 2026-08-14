import { createScene, createRef, Rect, Effects, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** {@link Effects.invert}: colors flip toward their negative as `strength` ramps from 0 to 1. */
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
                flow={'horizontal'}
                gap={16}
                padding={20}
                effects={Effects.invert(0)}
            >
                <Rect width={'fill'} height={'fill'} cornerRadius={12} fill={'#6990dd'} />
                <Rect width={'fill'} height={'fill'} cornerRadius={12} fill={'#e8617c'} />
                <Rect width={'fill'} height={'fill'} cornerRadius={12} fill={'#f2c94c'} />
            </Rect>
        </Rect>,
    );

    yield* card().to({ effects: Effects.invert(1) }, 1.2, easeInOut('quad'));
    yield* holdTail(1.2);
});
