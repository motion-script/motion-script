

import { createScene, Polygram, Fills } from "motion-script";
import { shapeScene, ShapeSceneSpec } from "./shape-scene";

/** Showcase for Polygram-specific properties: sides, ratio, cornerRadius, and cornerStyle. */
const spec: ShapeSceneSpec = {
    label: 'Polygram',
    fill: Fills.color('#FF6B6B'),
    stroke: Fills.color('#4ECDC4'),
    anims: [
        { label: 'sides', prop: 'sides', from: 4, to: 8, duration: 2 },
        { label: 'ratio', prop: 'ratio', from: 0.5, to: 0.2, duration: 2 },
        { label: 'cornerRadius', prop: 'cornerRadius', from: 0, to: 20, duration: 2 },
        { label: 'cornerStyle', prop: 'cornerStyle', from: 'rounded', to: 'angled', duration: 1.5 },
    ],
};

export default createScene(shapeScene(spec, (container, props) => {
    container.add(
        <Polygram
            width={320} height={320}
            fill={props.fill}
            stroke={props.stroke}
            sides={props.sides ?? 4}
            ratio={props.ratio ?? 0.5}
            cornerRadius={props.cornerRadius ?? 0}
            cornerStyle={props.cornerStyle ?? 'rounded'}
        />
    );
}));
