import { createScene, createRef, Rect, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** A plain CSS color string as `fill` is shorthand for a solid fill; it tweens like any other color. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const rect = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect ref={rect} width={300} height={300} cornerRadius={24} fill={'#6990dd'} />
        </Rect>,
    );

    yield* rect().to({ fill: '#e8617c' }, 1.2, easeInOut('quad'));
    yield* holdTail(1.2);
});
