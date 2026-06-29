/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, Rect, easeOut } from '@motion-script/core';
import { Latex } from '@motion-script/latex';
import { holdTail } from './_lib';

/** Latex node rendering a simple formula (E = mc^2), fading in. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const formula = createRef<Latex>();
    stage.add(
        <Rect width={'fill'} height={'fill'} group={'stack'} align={{ x: 0, y: 0 }}>
            <Latex ref={formula} latex={'E = mc^2'} fontSize={96} fill={'#f4f6ff'} opacity={0} />
        </Rect>,
    );

    yield* formula().to({ opacity: 1 }, 0.8, easeOut('quad'));
    yield* holdTail(0.8);
});
