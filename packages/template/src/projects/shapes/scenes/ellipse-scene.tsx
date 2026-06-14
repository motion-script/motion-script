/** @jsxImportSource @motion-script/core/jsx */

import { Rect, Ellipse, Fills } from "@motion-script/core";
import { ShapeScene, ShapeSceneSpec } from "./shape-scene";

/** Showcase for Ellipse-specific properties: sweep, startAngle, and ratio. */
export class EllipseScene extends ShapeScene {
    readonly spec: ShapeSceneSpec = {
        label: 'Ellipse',
        fill: Fills.color('#6990DD'),
        stroke: Fills.color('#E8617C'),
        anims: [
            {
                label: 'sweep',
                prop: 'sweep',
                from: 360,
                to: 220,
                duration: 2,
            },
            {
                label: 'startAngle',
                prop: 'startAngle',
                from: 0,
                to: 90,
                duration: 2,
            },
            {
                label: 'ratio',
                prop: 'ratio',
                from: 1,
                to: 0,
                duration: 2,
            },
        ],
    };

    protected buildShape(container: Rect, props: Record<string, any>): void {
        container.addChild(
            <Ellipse
                width={320} height={320}
                fill={props.fill}
                stroke={props.stroke}
                sweep={props.sweep ?? 0}
                startAngle={props.startAngle ?? 0}
                ratio={props.ratio ?? 1}
            />
        );
    }
}
