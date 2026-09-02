import { createRef, Rect, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/**
 * Rect with a fixed corner radius switching its `cornerStyle` from `'rounded'`
 * (circular arc) to `'angled'` (straight chamfer). The style is a discrete enum
 * that snaps at the tween midpoint, so the held tail shows the chamfered corners.
 */
const rect = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
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
}, [
    () => rect().to({ cornerStyle: 'angled' }, 1.2, easeInOut('quad')),
    holdTail(1.2),
]);
