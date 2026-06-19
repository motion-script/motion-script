/** @jsxImportSource @motion-script/core/jsx */

import { createScene, Polygon, Fills } from "@motion-script/core";
import { shapeScene, ShapeSceneSpec } from "./shape-scene";

/** Showcase for Polygon-specific properties: sides, cornerRadius, and cornerStyle. */
const spec: ShapeSceneSpec = {
    label: 'Polygon',
    fill: Fills.color('#C77DFF'),
    stroke: Fills.color('#FF9F1C'),
    anims: [
        { label: 'sides', prop: 'sides', from: 3, to: 8, duration: 2 },
        { label: 'cornerRadius', prop: 'cornerRadius', from: 0, to: 40, duration: 2 },
        { label: 'cornerStyle', prop: 'cornerStyle', from: 'rounded', to: 'angled', duration: 1.5 },
    ],
};

export default createScene(shapeScene(spec, (container, props) => {
    container.addChild(
        <Polygon
            width={320} height={320}
            fill={props.fill}
            stroke={props.stroke}
            sides={props.sides ?? 3}
            cornerRadius={props.cornerRadius ?? 0}
            cornerStyle={props.cornerStyle ?? 'rounded'}
        />
    );
}));
