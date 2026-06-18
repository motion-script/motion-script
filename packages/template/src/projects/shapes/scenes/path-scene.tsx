/** @jsxImportSource @motion-script/core/jsx */

import {
    Scene, createRef, Text, Rect, Path,
    Fills, Fill, easeInOutQuad, wait, tween,
} from "@motion-script/core";
import { BuildStage } from "@motion-script/core";
import { ShapeScene, ShapeSceneSpec } from "./shape-scene";

const PATHS = [
    // Arrow right
    'M 0 40 L 80 40 L 80 0 L 160 80 L 80 160 L 80 120 L 0 120 Z',
    // Star
    'M 80 0 L 99 55 L 160 55 L 112 89 L 129 145 L 80 110 L 31 145 L 48 89 L 0 55 L 61 55 Z',
    // Heart
    'M 80 140 C 80 140 0 90 0 45 C 0 20 20 0 45 0 C 60 0 75 10 80 25 C 85 10 100 0 115 0 C 140 0 160 20 160 45 C 160 90 80 140 80 140 Z',
    // Diamond
    'M 80 0 L 160 80 L 80 160 L 0 80 Z',
];

/** Showcase for Polygon-specific properties: sides, cornerRadius, and cornerStyle. */
export class PathScene extends ShapeScene {
    readonly spec: ShapeSceneSpec = {
        label: 'Path',
        fill: Fills.color('#C77DFF'),
        stroke: Fills.color('#FF9F1C'),
        anims: [
            {
                label: 'Data',
                prop: 'd',
                from: PATHS[0],
                to: PATHS[1],
                duration: 2,
            },
            {
                label: 'Data',
                prop: 'd',
                from: PATHS[1],
                to: PATHS[2],
                duration: 2,
            },
            {
                label: 'Data',
                prop: 'd',
                from: PATHS[2],
                to: PATHS[3],
                duration: 2,
            },
            {
                label: 'Data',
                prop: 'd',
                from: PATHS[3],
                to: PATHS[4],
                duration: 2,
            },

        ],
    };

    protected buildShape(container: Rect, props: Record<string, any>): void {
        container.addChild(
            <Path
                width={320} height={320}
                fill={props.fill}
                stroke={props.stroke}
                d={props.d ?? ""}

            />
        );
    }
}
