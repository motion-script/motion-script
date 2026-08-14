import { createScene, createRef, Rect, wait } from 'motion-script';
import { holdTail } from './_lib';

/**
 * Node-level `blend`: a translucent group fades from `'pass-through'` (the
 * default — not isolated, opacity scales each child while they blend directly
 * against the backdrop) to `'difference'` (isolated — children flatten into
 * one layer first, then that flat result blends against the backdrop), changing
 * how the two overlapping child circles interact with the background.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const group = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect width={360} height={360} fill={'#28d6c8'} center={{ x: -100, y: 0 }} />
            <Rect
                ref={group}
                width={400}
                height={260}
                opacity={0.6}
                flow={'freeform'}
                align={{ x: 0, y: 0 }}
                blend={'pass-through'}
            >
                <Rect width={220} height={220} cornerRadius={110} fill={'#e83fd6'} center={{ x: -50, y: 0 }} />
                <Rect width={220} height={220} cornerRadius={110} fill={'#f2c94c'} center={{ x: 50, y: 0 }} />
            </Rect>
        </Rect>,
    );

    yield* wait(0.3);
    yield* group().to({ blend: 'difference' }, 0.9, undefined);
    yield* holdTail(1.2);
});
