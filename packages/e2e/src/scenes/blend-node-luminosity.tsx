import { createScene, createRef, Rect, wait } from 'motion-script';
import { holdTail } from './_lib';

/** Node2D-level `blend`: a bright circle isolates and blends against a colorful backdrop via `'luminosity'`, taking the circle's luminosity while keeping the backdrop's hue and saturation. */
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
                fill={'#f4f6ff'}
                center={{ x: 60, y: 0 }}
                blend={'normal'}
            />
        </Rect>,
    );

    yield* wait(0.3);
    yield* circle().to({ blend: 'luminosity' }, 0.9, undefined);
    yield* holdTail(1.2);
});
