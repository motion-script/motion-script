import { createScene, createRef, Rect, wait } from 'motion-script';
import { holdTail } from './_lib';

/** Node2D-level `blend`: a magenta circle isolates and blends against a grayscale backdrop via `'color'`, taking the circle's hue and saturation while keeping the backdrop's luminosity. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const circle = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect width={360} height={360} fill={'#3a3a3a'} center={{ x: -60, y: 0 }} />
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
    yield* circle().to({ blend: 'color' }, 0.9, undefined);
    yield* holdTail(1.2);
});
