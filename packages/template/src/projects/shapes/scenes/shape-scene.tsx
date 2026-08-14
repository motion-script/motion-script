

import {
    SceneGenerator, createRef, Text, Rect,
    Fill, easeInOut, parallel, wait,
} from "motion-script";

/**
 * Mounts the concrete shape into a container with merged current props. Called
 * once for the fill sample (props contains `fill`) and once for the stroke
 * sample (props contains `stroke`). Implementations `container.add(...)` the node.
 */
export type BuildShape = (container: Rect, props: Record<string, any>) => void;

/**
 * Per-property animation step: animate a named prop from one value to another.
 */
export interface PropAnim<T = any> {
    label: string;
    prop: string;
    from: T;
    to: T;
    duration?: number;
}

export interface ShapeSceneSpec {
    /** Card heading shown above the shape sample. */
    label: string;
    /** Initial fill for the shape. */
    fill: Fill;
    /** Initial stroke fill for the shape. */
    stroke: Fill;
    /** Stroke weight. Defaults to 12. */
    strokeWeight?: number;
    /** Sequence of property animations to run one after another. */
    anims: PropAnim[];
    /** Seconds to hold on first state before animating (default 0.5). */
    holdBefore?: number;
    /** Seconds to hold between each animation step (default 0.5). */
    holdBetween?: number;
}

/**
 * Base scene for per-shape property showcase. Renders a fill sample and a
 * stroke sample of the shape side by side, then runs each PropAnim in sequence.
 *
 * Subclasses provide `spec` and implement `buildShape()` to mount the concrete
 * shape node into a given container with merged current props.
 */
/**
 * A parameterized scene generator for per-shape property showcases. Each shape's
 * `?scene` file calls `createScene(shapeScene(spec, buildShape))`, passing its
 * metadata and a `buildShape` that mounts the concrete shape node.
 */
export const shapeScene = (spec: ShapeSceneSpec, buildShape: BuildShape): SceneGenerator => function* (stage) {
        stage.set({ fill: 'bg' });

        const {
            label,
            fill,
            stroke,
            strokeWeight = 12,
            anims,
            holdBefore = 0.5,
            holdBetween = 0.5,
        } = spec;

        const currentProps: Record<string, any> = {};
        for (const anim of anims) currentProps[anim.prop] = anim.from;

        const fillRef = createRef<Rect>();
        const strokeRef = createRef<Rect>();

        stage.add(
            <Rect width={'fill'} height={'fill'} flow={'vertical'} padding={80} gap={32}>
                <Text
                    fontFamily={'Pixelify Sans'}
                    text={label}
                    fontSize={80}
                    fill={'gray'}
                    width={'fill'}
                    textAlign={'start'}
                />
                <Rect width={'fill'} height={'fill'} flow={'horizontal'} gap={80} align={{ x: 0, y: 0 }}>
                    <Rect
                        ref={fillRef}
                        width={500} height={500}
                        flow={'freeform'}
                        fill={'card'}
                        cornerRadius={24}
                    />
                    <Rect
                        ref={strokeRef}
                        width={500} height={500}
                        flow={'freeform'}
                        fill={'card'}
                        cornerRadius={24}
                    />
                </Rect>
            </Rect>
        );

        buildShape(fillRef(), { ...currentProps, fill });
        buildShape(strokeRef(), { ...currentProps, stroke: { weight: strokeWeight, fill: stroke } });

        yield* wait(holdBefore);

        for (let i = 0; i < anims.length; i++) {
            const anim = anims[i];
            const dur = anim.duration ?? 2;

            const fillShape = fillRef().children[0] as any;
            const strokeShape = strokeRef().children[0] as any;

            if (fillShape && strokeShape) {
                yield* parallel(
                    fillShape.to({ [anim.prop]: anim.to } as any, dur, easeInOut('quad')),
                    strokeShape.to({ [anim.prop]: anim.to } as any, dur, easeInOut('quad')),
                );
            }

            currentProps[anim.prop] = anim.to;

            if (i < anims.length - 1) {
                yield* wait(holdBetween);
            }
        }

        yield* wait(holdBefore);
};
