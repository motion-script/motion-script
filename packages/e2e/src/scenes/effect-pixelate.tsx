import { createScene, createRef, Rect, Effects, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** {@link Effects.pixelate}: the block count drops from pristine (many blocks) to chunky mosaic (few blocks). */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const card = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={card}
                width={320}
                height={320}
                cornerRadius={20}
                fill={'card'}
                flow={'horizontal'}
                gap={0}
                effects={Effects.pixelate(64)}
            >
                <Rect width={'fill'} height={'fill'} fill={'#6990dd'} />
                <Rect width={'fill'} height={'fill'} fill={'#e8617c'} />
                <Rect width={'fill'} height={'fill'} fill={'#f2c94c'} />
            </Rect>
        </Rect>,
    );

    yield* card().to({ effects: Effects.pixelate(8) }, 1.2, easeInOut('quad'));
    yield* holdTail(1.2);
});
