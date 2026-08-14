import { createScene, createRef, Rect, Fills, wait } from 'motion-script';
import { holdTail } from './_lib';

/** Fill-level `blend`: a circle's *fill* (not the node) blends against the card beneath it via `'overlay'`, multiplying on dark areas and screening on light ones. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const circle = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect width={360} height={360} fill={'#28d6c8'} center={{ x: -60, y: 0 }} />
            <Rect
                ref={circle}
                width={300}
                height={300}
                cornerRadius={150}
                fill={Fills.color('#e83fd6', { blend: 'normal' })}
                center={{ x: 60, y: 0 }}
            />
        </Rect>,
    );

    yield* wait(0.3);
    yield* circle().to({ fill: Fills.color('#e83fd6', { blend: 'overlay' }) }, 0.9, undefined);
    yield* holdTail(1.2);
});
