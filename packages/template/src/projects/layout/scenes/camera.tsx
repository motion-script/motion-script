/** @jsxImportSource @motion-script/core/jsx */

import { Scene, createRef, Rect, easeInOutQuad, parallel, Camera } from "@motion-script/core";
import { layoutCard, tile } from "./layout-card";

/**
 * Demonstrates `group="column"`: children stack top-to-bottom along the main
 * axis, separated by `gap`. The tiles grow their height in sequence so you can
 * watch the column reflow — siblings push down to make room as each one
 * expands, the defining behaviour of a vertical flex container.
 */
export class CameraScene extends Scene {
    *build() {
        this.set({ fill: 'bg' });
        const cameraRef = createRef<Camera>();
        const rectRef = createRef<Rect>();
        this.add(<Camera ref={cameraRef} fill={'card'} width={800} height={800} stroke={{ weight: 4, fill: 'white' }} >

            <Rect ref={rectRef} width={100} height={100} fill={'red'} />
        </Camera>);

        yield* cameraRef().to({ centerOn: { x: 300, y: 0 }, heading: 40, zoom: 2 }, 2);
    }
}
