/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, Rect, easeInOut } from '@motion-script/core';
import { holdTail } from './_lib';

/** A satellite node's `center` pinned to the card's `rightCenter` anchor, following it as the card grows. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const card = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} group={'stack'} align={{ x: 0, y: 0 }}>
            <Rect ref={card} width={220} height={140} cornerRadius={16} fill={'card'} />
            <Rect width={20} height={20} cornerRadius={10} fill={'primary'} center={() => card().rightCenter} />
        </Rect>,
    );

    yield* card().to({ width: 360, height: 240 }, 1.2, easeInOut('quad'));
    yield* holdTail(1.2);
});
