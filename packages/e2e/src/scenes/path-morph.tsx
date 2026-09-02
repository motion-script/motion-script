

import { createRef, Path, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/**
 * {@link Path.data} morphing: animating `to({ data })` smoothly reconciles a
 * 4-point square outline into an 8-point star, despite the differing point
 * counts.
 */
const shape = createRef<Path>();
const star =
        'M 0 -150 L 35 -50 L 140 -50 L 55 15 L 85 120 L 0 55 L -85 120 L -55 15 L -140 -50 L -35 -50 Z';
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    const square = 'M -120 -120 L 120 -120 L 120 120 L -120 120 Z';
    stage.add(
        <Path ref={shape} data={square} fill={'primary'} center={() => stage.canvas.center} />,
    );
}, [
    () => shape().to({ data: star }, 1.5, easeInOut('quad')),
    holdTail(1.5),
]);
