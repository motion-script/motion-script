import { createScene, createRef, Rect, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** Rect drawing its outline in: `end` animates 0 → 1 to reveal the path. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const rect = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={rect}
                width={320}
                height={220}
                cornerRadius={12}
                fill={'transparent'}
                stroke={{ weight: 8, fill: 'primary', cap: 'round' }}
                start={0}
                end={0}
            />
        </Rect>,
    );

    yield* rect().to({ end: 1 }, 1.5, easeInOut('quad'));
    yield* holdTail(1.5);
});
