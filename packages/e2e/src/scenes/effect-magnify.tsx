/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, Rect, Grid, Effects, easeInOut } from '@motion-script/core';
import { holdTail } from './_lib';

/** {@link Effects.magnify}: a lens magnifies the backdrop beneath the node, scaling up from no zoom to a strong 3x. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const lens = createRef<Rect>();
    stage.add(
        <Grid width={'fill'} height={'fill'} columns={4} gap={2} padding={40}>
            <Rect width={'fill'} height={'fill'} fill={'#6990dd'} />
            <Rect width={'fill'} height={'fill'} fill={'#e8617c'} />
            <Rect width={'fill'} height={'fill'} fill={'#f2c94c'} />
            <Rect width={'fill'} height={'fill'} fill={'#6990dd'} />
            <Rect width={'fill'} height={'fill'} fill={'#e8617c'} />
            <Rect width={'fill'} height={'fill'} fill={'#f2c94c'} />
            <Rect width={'fill'} height={'fill'} fill={'#6990dd'} />
            <Rect width={'fill'} height={'fill'} fill={'#e8617c'} />
            <Rect width={'fill'} height={'fill'} fill={'#f2c94c'} />
            <Rect width={'fill'} height={'fill'} fill={'#6990dd'} />
            <Rect width={'fill'} height={'fill'} fill={'#e8617c'} />
            <Rect width={'fill'} height={'fill'} fill={'#f2c94c'} />
        </Grid>,
    );
    stage.add(
        <Rect
            ref={lens}
            width={220}
            height={220}
            cornerRadius={110}
            stroke={{ weight: 4, fill: '#f4f6ff' }}
            center={() => stage.root.center}
            effects={Effects.magnify(1)}
        />,
    );

    yield* lens().to({ effects: Effects.magnify(3) }, 1.2, easeInOut('quad'));
    yield* holdTail(1.2);
});
