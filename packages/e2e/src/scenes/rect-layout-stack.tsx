/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, Rect, easeOut } from '@motion-script/core';
import { holdTail } from './_lib';

/** {@link Rect} `group={'stack'}`: three children centered and overlapping, popping in from largest to smallest. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const back = createRef<Rect>();
    const mid = createRef<Rect>();
    const front = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} group={'stack'} align={{ x: 0, y: 0 }}>
            <Rect ref={back} width={360} height={360} fill={'primary'} cornerRadius={20} scale={0} />
            <Rect ref={mid} width={240} height={240} fill={'card'} cornerRadius={20} scale={0} />
            <Rect ref={front} width={120} height={120} fill={'accent'} cornerRadius={20} scale={0} />
        </Rect>,
    );

    yield* back().to({ scale: 1 }, 0.5, easeOut('back'));
    yield* mid().to({ scale: 1 }, 0.5, easeOut('back'));
    yield* front().to({ scale: 1 }, 0.5, easeOut('back'));
    yield* holdTail(1.5);
});
