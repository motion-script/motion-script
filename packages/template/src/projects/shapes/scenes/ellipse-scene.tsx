

import { createScene, Ellipse, Fills } from "motion-script";
import { shapeScene, ShapeSceneSpec } from "./shape-scene";

/** Showcase for Ellipse-specific properties: sweep, startAngle, and ratio. */
const spec: ShapeSceneSpec = {
    label: 'Ellipse',
    fill: Fills.color('#6990DD'),
    stroke: Fills.color('#E8617C'),
    anims: [
        { label: 'sweep', prop: 'sweep', from: 360, to: 220, duration: 2 },
        { label: 'startAngle', prop: 'startAngle', from: 0, to: 90, duration: 2 },
        { label: 'ratio', prop: 'ratio', from: 1, to: 0, duration: 2 },
    ],
};

export default createScene(shapeScene(spec, (container, props) => {
    container.add(
        <Ellipse
            width={320} height={320}
            fill={props.fill}
            stroke={props.stroke}
            sweep={props.sweep ?? 0}
            startAngle={props.startAngle ?? 0}
            ratio={props.ratio ?? 1}
        />
    );
}));
