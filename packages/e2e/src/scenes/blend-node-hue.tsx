import { createScene, createRef, Rect, wait } from 'motion-script';
import { holdTail } from './_lib';

/** Node2D-level `blend`: a magenta circle isolates and blends against a cyan backdrop via `'hue'`, taking the circle's hue while keeping the backdrop's saturation and luminosity. */
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
                fill={'#e83fd6'}
                center={{ x: 60, y: 0 }}
                blend={'normal'}
            />
        </Rect>,
    );

    yield* wait(0.3);
    yield* circle().to({ blend: 'hue' }, 0.9, undefined);
    yield* holdTail(1.2);
});
