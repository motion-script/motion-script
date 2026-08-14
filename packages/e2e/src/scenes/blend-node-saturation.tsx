import { createScene, createRef, Rect, wait } from 'motion-script';
import { holdTail } from './_lib';

/** Node-level `blend`: a saturated circle isolates and blends against a desaturated backdrop via `'saturation'`, taking the circle's saturation while keeping the backdrop's hue and luminosity. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const circle = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect width={360} height={360} fill={'#5d6470'} center={{ x: -60, y: 0 }} />
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
    yield* circle().to({ blend: 'saturation' }, 0.9, undefined);
    yield* holdTail(1.2);
});
