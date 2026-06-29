/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, Rect, Effects, easeInOut } from '@motion-script/core';
import { holdTail } from './_lib';

/**
 * `Effects.pixelate({blocks, sharpColors: false})`: with `sharpColors` off,
 * each mosaic block averages its source area smoothly instead of snapping to a
 * single solid sample — softer than the default "Sharp Colors" look.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const card = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} group={'stack'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={card}
                width={320}
                height={320}
                cornerRadius={20}
                fill={'card'}
                group={'row'}
                gap={0}
                effects={Effects.pixelate({ blocks: 64, sharpColors: false })}
            >
                <Rect width={'fill'} height={'fill'} fill={'#6990dd'} />
                <Rect width={'fill'} height={'fill'} fill={'#e8617c'} />
                <Rect width={'fill'} height={'fill'} fill={'#f2c94c'} />
            </Rect>
        </Rect>,
    );

    yield* card().to({ effects: Effects.pixelate({ blocks: 8, sharpColors: false }) }, 1.2, easeInOut('quad'));
    yield* holdTail(1.2);
});
