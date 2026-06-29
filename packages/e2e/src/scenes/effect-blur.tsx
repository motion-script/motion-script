/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, Rect, Text, Effects, easeInOut } from '@motion-script/core';
import { holdTail } from './_lib';

/** A Gaussian blur effect ramping up on a labelled card. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const card = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} group={'stack'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={card}
                width={360}
                height={240}
                cornerRadius={20}
                fill={'primary'}
                group={'stack'}
                align={{ x: 0, y: 0 }}
                effects={Effects.blur(0)}
            >
                <Text text={'BLUR'} fontFamily={'Inter'} fontSize={64} fill={'#0d0f15'} />
            </Rect>
        </Rect>,
    );

    yield* card().to({ effects: Effects.blur(18) }, 1.2, easeInOut('quad'));
    yield* holdTail(1.2);
});
