/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, Camera, GridPattern, Fills, easeInOut } from '@motion-script/core';
import { holdTail } from './_lib';

/**
 * Exercises {@link GridPattern.subdivisions}: a world-anchored grid (cellSize
 * 120) viewed through a {@link Camera}, with a distinct lighter `subStroke` for
 * the minor lines. The subdivision count animates 1 → 3, so the mid frame
 * catches the minor lines filling in between every major cell line across the
 * whole visible region.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });

    const grid = createRef<GridPattern>();
    stage.add(
        <Camera width={720} height={460} fill={'card'} cornerRadius={12} stroke={{ weight: 3, fill: '#2c3344' }}>
            <GridPattern
                ref={grid}
                cellSize={120}
                subdivisions={1}
                fill={Fills.color('card')}
                stroke={{ weight: 3, fill: 'primary' }}
                subStroke={{ weight: 1, fill: 'accent' }}
            />
        </Camera>,
    );

    // Densify the minor lines: each world cell splits into three.
    yield* grid().to({ subdivisions: 3 }, 1.4, easeInOut('quad'));
    yield* holdTail(1.4);
});
