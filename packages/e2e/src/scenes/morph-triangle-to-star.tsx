/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, Path, easeInOut } from '@motion-script/core';
import { holdTail } from './_lib';

const TRIANGLE = 'M 0 -110 L 95 70 L -95 70 Z';
const STAR =
    'M 0 -110 L 26 -35 L 105 -35 L 42 13 L 65 88 L 0 42 L -65 88 L -42 13 L -105 -35 L -26 -35 Z';

/** {@link Path}'s `data` prop morphing from a 3-point triangle into a 10-point star — different point counts and winding, reconciled automatically by the morph plan's subdivision + ring alignment. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const shape = createRef<Path>();
    stage.add(
        <Path ref={shape} data={TRIANGLE} fill={'accent'} center={() => stage.root.center} />,
    );

    yield* shape().to({ data: STAR }, 1.4, easeInOut('quad'));
    yield* holdTail(1.4);
});
