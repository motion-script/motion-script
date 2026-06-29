/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, Rect, easeInOut } from '@motion-script/core';
import { holdTail } from './_lib';

/** {@link Rect} `group={'column'}`: three children laid top-to-bottom, with the gap animating wider. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const column = createRef<Rect>();
    stage.add(
        <Rect ref={column} width={220} height={420} group={'column'} gap={8} center={() => stage.root.center}>
            <Rect width={'fill'} height={100} fill={'primary'} cornerRadius={12} />
            <Rect width={'fill'} height={100} fill={'accent'} cornerRadius={12} />
            <Rect width={'fill'} height={100} fill={'primary'} cornerRadius={12} />
        </Rect>,
    );

    yield* column().to({ gap: 32 }, 1.4, easeInOut('quad'));
    yield* holdTail(1.4);
});
