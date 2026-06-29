/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, Rect, easeInOut } from '@motion-script/core';
import { holdTail } from './_lib';

/** A basic drop shadow whose blur + offset grow as the card lifts off the surface. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const card = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} group={'stack'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={card}
                width={320}
                height={220}
                cornerRadius={20}
                fill={'#f4f6ff'}
                shadow={{ blur: 4, offset: { x: 0, y: 2 }, fill: '#000000' }}
            />
        </Rect>,
    );

    yield* card().to(
        { shadow: { blur: 48, offset: { x: 0, y: 32 }, fill: '#000000' } },
        1.2,
        easeInOut('quad'),
    );
    yield* holdTail(1.2);
});
