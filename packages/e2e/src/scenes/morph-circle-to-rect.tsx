

import { createScene, createRef, Path, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

const CIRCLE = 'M 90 0 A 90 90 0 1 1 -90 0 A 90 90 0 1 1 90 0 Z';
const ROUNDED_RECT = 'M -120 -70 L 120 -70 Q 140 -70 140 -50 L 140 50 Q 140 70 120 70 L -120 70 Q -140 70 -140 50 L -140 -50 Q -140 -70 -120 -70 Z';

/** {@link Path}'s `data` prop morphing smoothly from a circle into a rounded rectangle, reconciled into a common cubic correspondence under the hood. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const shape = createRef<Path>();
    stage.add(
        <Path ref={shape} data={CIRCLE} fill={'primary'} center={() => stage.canvas.center} />,
    );

    yield* shape().to({ data: ROUNDED_RECT }, 1.4, easeInOut('quad'));
    yield* holdTail(1.4);
});
