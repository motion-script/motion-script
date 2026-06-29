/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, Rect, easeInOut } from '@motion-script/core';
import { holdTail } from './_lib';

/**
 * `width={'fill'} height={'fill'}`: a child stretches to fill its padded
 * parent, then tracks the parent as it resizes — confirming `'fill'` is
 * computed relative to the live content box, not a one-time snapshot.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const parent = createRef<Rect>();
    stage.add(
        <Rect ref={parent} width={300} height={460} fill={'card'} cornerRadius={16} padding={20} center={() => stage.root.center}>
            <Rect width={'fill'} height={'fill'} fill={'primary'} cornerRadius={8} />
        </Rect>,
    );

    yield* parent().to({ width: 700, height: 220 }, 1.4, easeInOut('quad'));
    yield* holdTail(1.4);
});
