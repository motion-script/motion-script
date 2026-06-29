/** @jsxImportSource @motion-script/core/jsx */

import { createScene, Video, wait } from '@motion-script/core';
import { holdTail } from './_lib';

/** {@link Video} playing a trimmed window (`trimStart`/`trimEnd`) of the source clip at normal speed, muted so the e2e harness stays deterministic. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    stage.add(
        <Video
            src={'video.mp4'}
            width={480}
            height={270}
            fit={'fill'}
            trimStart={0.5}
            trimEnd={2.5}
            muted={true}
            center={() => stage.root.center}
        />,
    );

    yield* wait(1.8);
    yield* holdTail(1.8);
});
