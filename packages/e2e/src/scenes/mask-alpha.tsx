/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, MaskGroup, Ellipse, Rect, Fills, easeInOut } from '@motion-script/core';
import { holdTail } from './_lib';

/** {@link MaskGroup} in `'alpha'` mode: the mask shape's rendered alpha — here a radial gradient fading to transparent — drives the content's visibility, producing a soft-edged reveal instead of a hard clip. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const mask = createRef<Ellipse>();
    stage.add(
        <MaskGroup mode={'alpha'} width={'fill'} height={'fill'}>
            <Ellipse ref={mask} width={120} height={120} fill={Fills.radialGradient(['#ffffff', '#ffffff00'])} />
            <Rect width={400} height={260} cornerRadius={20} fill={Fills.linearGradient(['#28d6c8', '#e83fd6'])} />
        </MaskGroup>,
    );

    yield* mask().to({ width: 520, height: 520 }, 1.4, easeInOut('quad'));
    yield* holdTail(1.4);
});
