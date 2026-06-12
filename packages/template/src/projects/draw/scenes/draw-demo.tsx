/** @jsxImportSource @motion-script/core/jsx */

import {
    Scene, createRef, Text, Rect, Fill, FillSpace,
    easeInOutQuad, parallel, sequence,
} from "@motion-script/core";
import { DrawnShape } from "../nodes/drawn-shape";

/**
 * Shared scaffolding for the per-fill-space showcase scenes.
 *
 * Every scene paints the *same* complex silhouette — built entirely from draw
 * commands inside {@link DrawnShape} (rect + ellipse + bezier path, with two
 * holes punched via `.cut()`) — and fills it with one linear gradient. The only
 * thing that changes between scenes is the fill {@link FillSpace}: `local`,
 * `global`, `parent`, or `view`. Because the gradient is identical, the way it
 * lands on the figure makes the space directly comparable.
 *
 * The figure drifts and the gradient's endpoints swing so the mapping is shown
 * in motion — under `view`/`parent` the gradient stays pinned to the frame as
 * the shape moves through it, whereas `global`/`local` travel with the shape.
 */
export abstract class DrawDemoScene extends Scene {
    /** Fill space this scene demonstrates. */
    abstract readonly space: FillSpace;
    /** Card heading. */
    abstract readonly label: string;

    *build() {
        this.set({ fill: 'bg' });

        const shapeRef = createRef<DrawnShape>();
        const space = this.space;

        const fillFrom = Fill.linearGradient(['#6990DD', '#E8617C', '#F5C26B'], {
            space, start: { x: -1, y: -1 }, end: { x: 1, y: 1 },
        });
        const fillTo = Fill.linearGradient(['#6990DD', '#E8617C', '#F5C26B'], {
            space, start: { x: 1, y: -1 }, end: { x: -1, y: 1 },
        });

        this.add(
            <Rect width={'fill'} height={'fill'} group={'column'} padding={80} gap={24}>
                <Text fontFamily={'Pixelify Sans'} text={this.label} fontSize={96} fill={'gray'} width={'fill'} align={'start'} />
                <Rect width={'fill'} height={'fill'} clip={true} borderRadius={32} group={'stack'} fill={'card'}>
                    <DrawnShape ref={shapeRef} space={space} extent={300} fill={fillFrom} />
                </Rect>
            </Rect>
        );

        // Drift the shape across the card while the gradient endpoints swing, so
        // the fill space's behaviour is visible as both move.
        yield* sequence(
            parallel(
                shapeRef().to({ x: -360 } as any, 2, easeInOutQuad),
                shapeRef().fillTo(fillTo, 2, { ease: easeInOutQuad }),
            ),
            parallel(
                shapeRef().to({ x: 360 } as any, 3, easeInOutQuad),
                shapeRef().fillTo(fillFrom, 3, { ease: easeInOutQuad }),
            ),
            shapeRef().to({ x: 0 } as any, 2, easeInOutQuad),
        );
    }
}
