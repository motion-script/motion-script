/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, Rect, Text, Effects, easeInOut } from '@motion-script/core';
import { holdTail } from './_lib';

/** {@link Effects.directionalBlur}: a horizontal smear grows from sharp to a long streak, like a motion-blurred pan. */
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
                effects={Effects.directionalBlur(0, 0)}
            >
                <Text text={'SPEED'} fontFamily={'Inter'} fontWeight={800} fontSize={56} fill={'#0d0f15'} />
            </Rect>
        </Rect>,
    );

    yield* card().to({ effects: Effects.directionalBlur(0, 60) }, 1.2, easeInOut('quad'));
    yield* holdTail(1.2);
});
