

import {
    SceneGenerator, createRef, Text, Rect,
    Fill, Shadow, easeInOut, parallel,
} from "motion-script";

/**
 * Shared scaffolding for the per-fill/stroke/shadow showcase scenes.
 *
 * Every demo follows the same shape: a labelled card holding two square
 * samples side by side — one painted via `fill`, the other via `stroke` —
 * which animate from a "from" state to a "to" state. Subclasses declare the
 * transition via {@link ShapeDemoScene.spec}; this base builds the layout and
 * runs the tween, so each scene file stays a tiny, consistent declaration.
 */
export interface ShapeDemoSpec {
    /** Card heading shown above the samples. */
    label: string;
    /** Fill chain the fill-sample starts in. */
    fillFrom: Fill;
    /** Fill chain the fill-sample animates to. */
    fillTo: Fill;
    /** Fill chain used for the stroke-sample's stroke at the start. */
    strokeFrom?: Fill;
    /** Fill chain used for the stroke-sample's stroke at the end. */
    strokeTo?: Fill;
    /** Optional shadow the samples start with. */
    shadowFrom?: Shadow;
    /** Optional shadow the samples animate to. */
    shadowTo?: Shadow;
    /** Stroke weight for the stroke-sample. Defaults to 16. */
    strokeWeight?: number;
    /** Seconds for the from -> to transition (default 3). */
    duration?: number;
}

/** A parameterized scene generator: per-demo `?scene` files call this with their
 *  {@link ShapeDemoSpec}, e.g. `createScene(shapeDemo({ label, fillFrom, fillTo }))`. */
export const shapeDemo = (spec: ShapeDemoSpec): SceneGenerator => function* (stage) {
        stage.set({ fill: 'bg' });

        const {
            label,
            fillFrom, fillTo,
            strokeFrom = fillFrom, strokeTo = fillTo,
            shadowFrom, shadowTo,
            strokeWeight = 16,
            duration = 3,
        } = spec;

        const fillRef = createRef<Rect>();
        const strokeRef = createRef<Rect>();

        stage.add(
            <Rect width={'fill'} height={'fill'} group={'column'} padding={80} gap={24}>
                <Text fontFamily={'Pixelify Sans'} text={label} fontSize={96} fill={'gray'} width={'fill'} textAlign={'start'} />
                <Rect width={'fill'} height={'fill'} group={'row'} gap={80}>
                    <Rect
                        ref={fillRef}
                        width={500} height={500} cornerRadius={32}
                        fill={fillFrom}
                        shadow={shadowFrom}
                    />
                    <Rect
                        ref={strokeRef}
                        width={500} height={500} cornerRadius={32}
                        stroke={{ weight: strokeWeight, fill: strokeFrom }}
                        shadow={shadowFrom}
                    />
                </Rect>
            </Rect>
        );

        const animations: any[] = [
            fillRef().to({ fill: fillTo } as any, duration, easeInOut('quad')),
            strokeRef().to({ stroke: { weight: strokeWeight, fill: strokeTo } } as any, duration, easeInOut('quad')),
        ];
        if (shadowTo) {
            animations.push(fillRef().to({ shadow: shadowTo } as any, duration, easeInOut('quad')));
            animations.push(strokeRef().to({ shadow: shadowTo } as any, duration, easeInOut('quad')));
        }

        yield* parallel(...animations);
};
