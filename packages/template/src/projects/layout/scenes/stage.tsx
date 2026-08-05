

import { createScene, createRef, Rect, parallel, Camera, LineGrid, Fills } from "motion-script";
import { layoutCard, tile } from "./layout-card";

/**
 * Demonstrates `group="column"`: children stack top-to-bottom along the main
 * axis, separated by `gap`. The tiles grow their height in sequence so you can
 * watch the column reflow — siblings push down to make room as each one
 * expands, the defining behaviour of a vertical flex container.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });

    const rectRef = createRef<Rect>();
    stage.add(

        <Rect ref={rectRef} width={100} height={100} fill={'red'} />


    );

    yield* stage.to({ lookAt: { x: 300, y: 0 }, heading: 40, zoom: 2 }, 2);
});
