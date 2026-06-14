/** @jsxImportSource @motion-script/core/jsx */

import {
    Scene, createRef, Text, Rect,
    Fill, easeInOutQuad, parallel, wait,
} from "@motion-script/core";
import { BuildStage } from "@motion-script/core";

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
export abstract class ShapeScene extends Scene {
    abstract readonly spec: ShapeSceneSpec;

    /**
     * Mount the shape into the container applying `props`. Called once for the
     * fill sample (props contains `fill`) and once for the stroke sample (props
     * contains `stroke`). Implementations should `container.add(...)` the node
     * and return it so the base can call `.to()` on it.
     */
    protected abstract buildShape(container: Rect, props: Record<string, any>): void;

    *build(_stage: BuildStage) {
        this.set({ fill: 'bg' });

        const {
            label,
            fill,
            stroke,
            strokeWeight = 12,
            anims,
            holdBefore = 0.5,
            holdBetween = 0.5,
        } = this.spec;

        const currentProps: Record<string, any> = {};
        for (const anim of anims) currentProps[anim.prop] = anim.from;

        const fillRef = createRef<Rect>();
        const strokeRef = createRef<Rect>();

        this.add(
            <Rect width={'fill'} height={'fill'} group={'column'} padding={80} gap={32}>
                <Text
                    fontFamily={'Pixelify Sans'}
                    text={label}
                    fontSize={80}
                    fill={'gray'}
                    width={'fill'}
                    align={'start'}
                />
                <Rect width={'fill'} height={'fill'} group={'row'} gap={80} alignment={{ x: 0, y: 0 }}>
                    <Rect
                        ref={fillRef}
                        width={500} height={500}
                        group={'stack'}
                        fill={'card'}
                        cornerRadius={24}
                    />
                    <Rect
                        ref={strokeRef}
                        width={500} height={500}
                        group={'stack'}
                        fill={'card'}
                        cornerRadius={24}
                    />
                </Rect>
            </Rect>
        );

        this.buildShape(fillRef(), { ...currentProps, fill });
        this.buildShape(strokeRef(), { ...currentProps, stroke: { weight: strokeWeight, fill: stroke } });

        yield* wait(holdBefore);

        for (let i = 0; i < anims.length; i++) {
            const anim = anims[i];
            const dur = anim.duration ?? 2;

            const fillShape = fillRef().children[0] as any;
            const strokeShape = strokeRef().children[0] as any;

            if (fillShape && strokeShape) {
                yield* parallel(
                    fillShape.to({ [anim.prop]: anim.to } as any, dur, easeInOutQuad),
                    strokeShape.to({ [anim.prop]: anim.to } as any, dur, easeInOutQuad),
                );
            }

            currentProps[anim.prop] = anim.to;

            if (i < anims.length - 1) {
                yield* wait(holdBetween);
            }
        }

        yield* wait(holdBefore);
    }
}
