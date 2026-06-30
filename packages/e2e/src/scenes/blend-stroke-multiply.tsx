import { createScene, createRef, Rect, Fills, wait } from 'motion-script';
import { holdTail } from './_lib';

/** Stroke-level `blend`: a thick circle outline's stroke *fill* blends against the card beneath it via `'multiply'`, darkening the overlap based on the stroke's color. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const circle = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} group={'stack'} align={{ x: 0, y: 0 }}>
            <Rect width={360} height={360} fill={'#28d6c8'} center={{ x: -60, y: 0 }} />
            <Rect
                ref={circle}
                width={260}
                height={260}
                cornerRadius={130}
                stroke={{ weight: 36, align: 'center', fill: Fills.color('#e83fd6', { blend: 'normal' }) }}
                center={{ x: 60, y: 0 }}
            />
        </Rect>,
    );

    yield* wait(0.3);
    yield* circle().strokeTo({ fill: Fills.color('#e83fd6', { blend: 'multiply' }) }, 0.9, {});
    yield* holdTail(1.2);
});
