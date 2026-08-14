import { createScene, createRef, Rect, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** `dash: n` — a single number becomes `[n, n]`, an even dash/gap pattern, growing from fine to coarse. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const rect = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={rect}
                width={360}
                height={240}
                cornerRadius={16}
                fill={'card'}
                stroke={{ weight: 6, fill: 'primary', dash: 4 }}
            />
        </Rect>,
    );

    yield* rect().strokeTo({ weight: 6, fill: 'primary', dash: 28 }, 1.4, { ease: easeInOut('quad') });
    yield* holdTail(1.4);
});
