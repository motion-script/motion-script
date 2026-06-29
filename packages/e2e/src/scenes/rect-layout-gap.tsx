/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, Rect, easeInOut } from '@motion-script/core';
import { holdTail } from './_lib';

/** {@link Rect.gap}: spacing between row children animating from tight to wide. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const row = createRef<Rect>();
    stage.add(
        <Rect ref={row} width={'fill'} height={200} group={'row'} align={{ x: 0, y: 0 }} gap={0} center={() => stage.root.center}>
            <Rect width={120} height={120} fill={'primary'} cornerRadius={16} />
            <Rect width={120} height={120} fill={'accent'} cornerRadius={16} />
            <Rect width={120} height={120} fill={'primary'} cornerRadius={16} />
        </Rect>,
    );

    yield* row().to({ gap: 60 }, 1.4, easeInOut('quad'));
    yield* holdTail(1.4);
});
