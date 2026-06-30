import { createScene, createRef, Rect, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/**
 * Rect with a fixed corner radius switching its `cornerStyle` from `'rounded'`
 * (circular arc) to `'angled'` (straight chamfer). The style is a discrete enum
 * that snaps at the tween midpoint, so the held tail shows the chamfered corners.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const rect = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} group={'stack'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={rect}
                width={300}
                height={300}
                cornerRadius={80}
                cornerStyle={'rounded'}
                fill={'primary'}
                stroke={{ weight: 6, fill: 'accent' }}
            />
        </Rect>,
    );

    yield* rect().to({ cornerStyle: 'angled' }, 1.2, easeInOut('quad'));
    yield* holdTail(1.2);
});
