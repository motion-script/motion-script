import { createRef, Rect, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** Rect drawing its outline in: `end` animates 0 → 1 to reveal the path. */
const rect = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
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
}, [
    () => rect().to({ end: 1 }, 1.5, easeInOut('quad')),
    holdTail(1.5),
]);
