/** @jsxImportSource @motion-script/core/jsx */

import {
    SceneGenerator, createRef, Rect, parallel, easeInOut,
} from "@motion-script/core";

/**
 * A deliberately heavy scene: ~`count` independently-animated rects, each
 * running a continuous position/rotation/scale tween. The per-frame cost
 * (advancing `count` steppers every frame) is what makes a *backward* scrub
 * slow — the evaluator must reset the generator to frame 0 and replay forward
 * to the target one frame at a time. That's the exact path the abortable-seek +
 * debounce work targets, so this is the stress fixture for it.
 *
 * The animation runs a fixed number of `legs` (so the scene has a definite
 * duration — the precomp drives the generator to completion with no frame cap,
 * so it must terminate). Each leg ping-pongs every rect to a fresh random pose.
 *
 * Parameterized so a project can drop in two near-identical instances (different
 * seed/background) without duplicating the body.
 */
export const expensive = (opts: {
    /** Number of animated rects. Higher = heavier per frame. */
    count?: number;
    /** RNG seed so each instance lays out differently but reproducibly. */
    seed?: string | number;
    /** Scene background fill. */
    fill?: string;
    /** Seconds per animation leg (each rect ping-pongs between random poses). */
    legDuration?: number;
    /** Number of legs to run. Scene duration ≈ legs × legDuration seconds. */
    legs?: number;
} = {}): SceneGenerator => function* (stage) {
    const { count = 1200, seed = "expensive", fill = "#e8c584", legDuration = 2.5, legs = 4 } = opts;

    stage.seed(seed);
    stage.set({ fill });

    const { width, height } = stage.viewport;
    const halfW = width / 2;
    const halfH = height / 2;
    const size = 24;

    // A random pose within the viewport.
    const pose = () => ({
        x: stage.random(-halfW, halfW),
        y: stage.random(-halfH, halfH),
        rotation: stage.random(0, 360),
        scale: stage.random(0.4, 1.6),
    });

    const refs = Array.from({ length: count }, () => createRef<Rect>());

    stage.add(
        <>
            {refs.map((ref) => {
                const start = pose();
                return (
                    <Rect
                        ref={ref}
                        width={size}
                        height={size}
                        cornerRadius={4}
                        fill={`hsl(${stage.random(0, 360)}, 70%, 60%)`}
                        x={start.x}
                        y={start.y}
                        rotation={start.rotation}
                        scale={start.scale}
                    />
                );
            })}
        </>,
    );

    // Each leg ping-pongs every rect to a fresh random pose, in lock-step
    // parallel, so each frame advances `count` live steppers — the heavy work a
    // backward scrub has to replay from frame 0.
    for (let i = 0; i < legs; i++) {
        yield* parallel(
            ...refs.map((ref) => ref().to(pose(), legDuration, easeInOut('quad'))),
        );
    }
};

export default expensive;
