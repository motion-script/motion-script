/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, Rect, easeInOut } from '@motion-script/core';
import { holdTail } from './_lib';

/** `join: 'round'`: corners are rounded into an arc instead of a sharp point, growing more visible as the stroke thickens. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const rect = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} group={'stack'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={rect}
                width={260}
                height={260}
                fill={'card'}
                stroke={{ weight: 10, fill: 'primary', join: 'round' }}
            />
        </Rect>,
    );

    yield* rect().strokeTo({ weight: 70, fill: 'primary', join: 'round' }, 1.4, { ease: easeInOut('quad') });
    yield* holdTail(1.4);
});
