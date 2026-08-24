

import { createScene, createRef, Path, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/**
 * {@link Path.data} morphing: animating `to({ data })` smoothly reconciles a
 * 4-point square outline into an 8-point star, despite the differing point
 * counts.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const shape = createRef<Path>();
    const square = 'M -120 -120 L 120 -120 L 120 120 L -120 120 Z';
    const star =
        'M 0 -150 L 35 -50 L 140 -50 L 55 15 L 85 120 L 0 55 L -85 120 L -55 15 L -140 -50 L -35 -50 Z';
    stage.add(
        <Path ref={shape} data={square} fill={'primary'} center={() => stage.canvas.center} />,
    );

    yield* shape().to({ data: star }, 1.5, easeInOut('quad'));
    yield* holdTail(1.5);
});
