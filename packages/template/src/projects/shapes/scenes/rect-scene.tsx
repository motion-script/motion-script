

import { createScene, Rect, Fills } from "motion-script";
import { shapeScene, ShapeSceneSpec } from "./shape-scene";

/** Showcase for Rect-specific properties: cornerRadius and cornerStyle. */
const spec: ShapeSceneSpec = {
    label: 'Rect',
    fill: Fills.color('#6990DD'),
    stroke: Fills.color('#E8617C'),
    anims: [
        { label: 'cornerRadius', prop: 'cornerRadius', from: 0, to: 80, duration: 2 },
        { label: 'cornerStyle', prop: 'cornerStyle', from: 'rounded', to: 'angled', duration: 1.5 },
    ],
};

export default createScene(shapeScene(spec, (container, props) => {
    container.add(
        <Rect
            width={320} height={320}
            fill={props.fill}
            stroke={props.stroke}
            cornerRadius={props.cornerRadius ?? 0}
            cornerStyle={props.cornerStyle ?? 'rounded'}
        />
    );
}));
