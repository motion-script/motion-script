/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, Rect, easeInOut } from '@motion-script/core';
import { holdTail } from './_lib';

/** Position, rotation, and scale all animating together on one node in a single tween. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const card = createRef<Rect>();
    stage.add(
        <Rect ref={card} width={160} height={160} cornerRadius={20} fill={'primary'} center={{ x: -260, y: 100 }} rotation={0} scale={0.6} />,
    );

    yield* card().to({ x: 260, y: -100, rotation: 270, scale: 1.4 }, 1.6, easeInOut('quad'));
    yield* holdTail(1.6);
});
