/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, Text, easeInOut } from '@motion-script/core';
import { holdTail } from './_lib';

/** {@link Text.lineHeight}: a wrapped paragraph's row spacing loosens from tight (0.9) to airy (2). */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const para = createRef<Text>();
    stage.add(
        <Text
            ref={para}
            text={'Line height controls the vertical rhythm between wrapped rows of text.'}
            fontFamily={'Inter'}
            fontSize={32}
            lineHeight={0.9}
            wrap={true}
            width={520}
            fill={'#f4f6ff'}
            center={() => stage.root.center}
        />,
    );

    yield* para().to({ lineHeight: 2 }, 1.4, easeInOut('quad'));
    yield* holdTail(1.4);
});
