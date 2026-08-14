import { createScene, createRef, Rect, Fills, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** A stroke's `fill` is the same loose {@link Fill} type as a node's `fill` — here a linear gradient sweeps its angle instead of a flat color. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const rect = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={rect}
                width={300}
                height={300}
                cornerRadius={24}
                fill={'card'}
                stroke={{ weight: 16, fill: Fills.linearGradient(['#6990dd', '#e8617c']) }}
            />
        </Rect>,
    );

    yield* rect().strokeTo({ weight: 16, fill: Fills.linearGradient(['#f2c94c', '#e8617c']) }, 1.4, { ease: easeInOut('quad') });
    yield* holdTail(1.4);
});
