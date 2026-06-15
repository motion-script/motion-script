/** @jsxImportSource @motion-script/core/jsx */

import { Scene, createRef, Rect, Ellipse, BuildStage, parallel } from "@motion-script/core";
import { ColumnScene } from "./column";
import { RowScene } from "./row";

/**
 * Demonstrates `fit` on a nested scene — a scene displayed inside another scene
 * acting almost like an image.
 *
 * Each child scene (`ColumnScene`, `RowScene`) is authored for the full viewport,
 * but here it sits in a smaller cell with a `fit`. Instead of reflowing its
 * content into the box, it lays itself out at full viewport size and scales the
 * whole world down to fit: `fit` (contain, letterboxed) on the left, `fill`
 * (cover, cropped) on the right. The inner animation still plays, just scaled.
 */
export class SceneScaling extends Scene {
    *build(stage: BuildStage) {
        this.set({ gap: 20, fill: 'bg', group: 'row', })

        const sceneA = createRef<Scene>();
        const sceneB = createRef<Scene>();
        const w = 1920 / 2.5;
        const h = 1080 / 2.5;
        this.add(
            <>
                <ColumnScene ref={sceneA} fit="fit" width={w} height={h} stroke={{ weight: 2, fill: 'white' }} />
                <RowScene ref={sceneB} fit="fill" width={w} height={h} stroke={{ weight: 2, fill: 'white' }} />
            </>
        );
        yield* parallel(
            sceneA().build(stage),
            sceneB().build(stage)
        );

    }
}
