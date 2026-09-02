import { createRef, Rect, Effects, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** {@link Effects.pixelate}: the block count drops from pristine (many blocks) to chunky mosaic (few blocks). */
const card = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
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
}, [
    () => card().to({ effects: Effects.pixelate(8) }, 1.2, easeInOut('quad')),
    holdTail(1.2),
]);
