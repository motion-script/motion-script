

import {
    SceneGenerator, createRef, Text, Rect, Image, Vector2,
    Fills, BlendMode, easeInOut, parallel, sequence, wait,
    Ellipse,
} from "motion-script";
/**
 * Generates the center coordinates for a 3-circle Venn/color diagram.
 * Assumes (0,0) is the center of the grid.
 * * @param radius - The radius of each individual circle.
 * @param overlapFactor - Controls how far from the center the circles are pushed out. Defaults to 0.5.
 * @returns An array of 3 Vector2 objects [Top, BottomRight, BottomLeft].
 */
function generateColorCircleCoordinates(radius: number, overlapFactor: number = 0.5): Vector2[] {
    const distance = radius * overlapFactor;
    const cos30 = Math.sqrt(3) / 2;

    return [
        { x: 0, y: distance },                  // Top
        { x: distance * cos30, y: -distance * 0.5 }, // Bottom Right
        { x: -distance * cos30, y: -distance * 0.5 } // Bottom Left
    ];
}
/**
 * Shared scaffolding for the per-blend-mode showcase scenes.
 *
 * Every demo lays a 3x2 grid of squares over the `cat.jpg` photo so the
 * blend mode has busy content to mix against. The top row paints each
 * square via `fill` (color, linear gradient, image), the bottom row paints
 * the same three fill kinds via `stroke`. All six squares start fully
 * transparent and fade in to opaque with the scene's blend mode applied to
 * their fill/stroke. Subclasses just declare {@link BlendDemoScene.mode}.
 *
 * The fade is followed by a hold at opacity 1. Because nodes composite
 * pass-through (opacity folds into the paints rather than isolating the node),
 * `blend` mixes against the photo throughout the fade — the blend is visible
 * mid-tween, not just at opacity === 1.
 */
/** Options for a {@link blendDemo} scene. */
export interface BlendDemoOpts {
    /**
     * The `mix-blend-mode` keyword this scene demonstrates. Named `mode` (not
     * `blend`) to avoid shadowing the {@link Node.blend} layer-blend prop, which
     * would isolate the whole scene node instead of the per-fill blend we want.
     */
    mode: BlendMode;
    /** Seconds for the opacity 0 -> 1 fade (default 2). */
    duration?: number;
    /** Seconds to hold at opacity 1 once the fade completes (default 1). */
    hold?: number;
}

/**
 * A parameterized scene generator: each per-mode `?scene` file calls this with
 * its blend mode (e.g. `createScene(blendDemo({ mode: 'multiply' }))`). One
 * instance per file keeps the hot-reload boundary intact.
 */
export const blendDemo = (opts: BlendDemoOpts): SceneGenerator => function* (stage) {
        stage.set({ fill: 'bg' });

        const { mode, duration = 2, hold = 1 } = opts;
        const radius = 300;
        const cords = generateColorCircleCoordinates(radius, 0.45);
        const refs = Array.from({ length: 3 }, () => createRef<Rect>());

        const fills = [
            Fills.color('red', { blend: mode }),
            Fills.color('blue', { blend: mode }),
            Fills.color('yellow', { blend: mode }),

            //Fills.linearGradient(['#6990DD', '#F5C26B'], { blend: mode, start: { x: -1, y: -1 }, end: { x: 1, y: 1 } }),
            // Fills.image('./cat.jpg', { fit: 'fill', blend: mode }),
        ];

        stage.add(
                <Rect width={'fill'} height={'fill'} flow={'vertical'} padding={80} gap={24}>
                    <Text fontFamily={'Pixelify Sans'} text={`Blend: ${mode}`} fontSize={96} fill={'gray'} width={'fill'} textAlign={'start'} />
                    <Rect width={'fill'} height={'fill'} clip={true} cornerRadius={32} flow={'freeform'}>
                        <Image src={'kingfisher.jpg'} fit={'fill'} width={1200} height={900} />
                        {refs.map((ref, i) => {
                            const { x, y } = cords[i];
                            return (
                                <Ellipse
                                    ref={ref}
                                    x={x}
                                    y={y}
                                    width={radius} height={radius}
                                    opacity={0}

                                    fill={fills[i]} />
                            );
                        })}
                    </Rect>
                </Rect>
            );

        yield* sequence(
            parallel(...refs.map(ref => ref().to({ opacity: 1 }, duration, easeInOut('quad')))),
            wait(hold),
        );
};
