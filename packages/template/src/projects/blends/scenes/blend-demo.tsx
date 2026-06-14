/** @jsxImportSource @motion-script/core/jsx */

import {
    Scene, createRef, Reference, Text, Rect, Image,
    Fills, BlendMode, easeInOutQuad, parallel, sequence, wait,
    Ellipse,
} from "@motion-script/core";
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
export abstract class BlendDemoScene extends Scene {
    /**
     * The `mix-blend-mode` keyword this scene demonstrates. Named `mode` (not
     * `blend`) to avoid shadowing the {@link Node.blend} layer-blend prop, which
     * would isolate the whole scene node instead of the per-fill blend we want.
     */
    abstract readonly mode: BlendMode;

    /** Seconds for the opacity 0 -> 1 fade (default 2). */
    readonly duration: number = 2;

    /** Seconds to hold at opacity 1 once the fade completes (default 1). */
    readonly hold: number = 1;

    *build() {
        this.set({ fill: 'bg' });

        const { mode, duration, hold } = this;
        const radius = 300;
        const cords = generateColorCircleCoordinates(radius, 0.45);
        const refs = Array.from({ length: 3 }, () => createRef<Rect>());

        const fills = [
            Fills.color('red', { blend: mode }),
            Fills.color('blue', { blend: mode }),
            Fills.color('yellow', { blend: mode }),

            //Fills.linearGradient(['#6990DD', '#F5C26B'], { blend: mode, start: { x: -1, y: -1 }, end: { x: 1, y: 1 } }),
            // Fills.image('./cat.jpg', { mode: 'fill', blend: mode }),
        ];

        const positions =


            this.add(
                <Rect width={'fill'} height={'fill'} group={'column'} padding={80} gap={24}>
                    <Text fontFamily={'Pixelify Sans'} text={`Blend: ${mode}`} fontSize={96} fill={'gray'} width={'fill'} align={'start'} />
                    <Rect width={'fill'} height={'fill'} clip={true} cornerRadius={32} group={'stack'}>
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
            parallel(...refs.map(ref => ref().to({ opacity: 1 }, duration, easeInOutQuad))),
            wait(hold),
        );
    }
}
