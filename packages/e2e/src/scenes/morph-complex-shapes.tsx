/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, Path, easeInOut } from '@motion-script/core';
import { holdTail } from './_lib';

// A blob with two disjoint subpaths (an outer ring and a separate inner hole-like
// shape) morphing into a single 5-point star — exercising multi-subpath pairing,
// where one subpath collapses to a point while the surviving one reshapes.
const BLOB = 'M -100 0 Q -100 -100 0 -100 Q 100 -100 100 0 Q 100 100 0 100 Q -100 100 -100 0 Z M -30 0 Q -30 -30 0 -30 Q 30 -30 30 0 Q 30 30 0 30 Q -30 30 -30 0 Z';
const STAR = 'M 0 -110 L 26 -35 L 105 -35 L 42 13 L 65 88 L 0 42 L -65 88 L -42 13 L -105 -35 L -26 -35 Z';

/** {@link Path}'s `d` prop morphing between shapes with a different *number* of subpaths — a two-subpath blob (ring + inner hole) collapsing into a single-subpath star. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const shape = createRef<Path>();
    stage.add(
        <Path ref={shape} d={BLOB} fill={'primary'} center={() => stage.root.center} />,
    );

    yield* shape().to({ d: STAR }, 1.6, easeInOut('quad'));
    yield* holdTail(1.6);
});
