/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, Rect, easeInOut, wait } from '@motion-script/core';
import { holdTail } from './_lib';

/** {@link easeInOut}`('back')`: a card slides across, overshooting past its target before settling back — the signature "anticipation" curve. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const card = createRef<Rect>();
    stage.add(
        <Rect ref={card} width={120} height={120} cornerRadius={16} fill={'primary'} center={{ x: -300, y: 0 }} />,
    );

    yield* card().to({ x: 300 }, 1.2, easeInOut('back'));
    yield* wait(0.2);
    yield* holdTail(1.4);
});
