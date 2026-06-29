/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, Rect, Fills, easeInOut } from '@motion-script/core';
import { holdTail } from './_lib';

/** Fill-level `opacity`: only the fill itself fades, leaving the stroke fully opaque throughout. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const card = createRef<Rect>();
    stage.add(
        <Rect
            ref={card}
            width={300}
            height={200}
            cornerRadius={20}
            fill={Fills.color('primary', { opacity: 1 })}
            stroke={{ weight: 6, fill: '#f4f6ff' }}
            center={() => stage.root.center}
        />,
    );

    yield* card().to({ fill: Fills.color('primary', { opacity: 0.1 }) }, 1.2, easeInOut('quad'));
    yield* holdTail(1.2);
});
