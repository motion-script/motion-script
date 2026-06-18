/** @jsxImportSource @motion-script/core/jsx */

import {
    Scene, createRef, Text, Rect,
    easeInOutQuad, sequence,
} from "@motion-script/core";
import { DrawnMask } from "../nodes/drawn-mask";

/**
 * Shows an inline mask built entirely from draw commands.
 *
 * {@link DrawnMask} opens a `.mask()` scope, draws the complex silhouette (rect
 * + ellipse + bezier path with a cut hole) as the mask, then draws sliding
 * diagonal colour stripes as the masked content. Animating the stripe `offset`
 * sweeps the colours under the static silhouette, so the figure stays put while
 * its fill churns — and the cut eye-hole reveals the card behind it.
 */
export class DrawMaskScene extends Scene {
    readonly label = 'Inline Mask — draw commands';

    *build() {
        this.set({ fill: 'bg' });

        const maskRef = createRef<DrawnMask>();
        const cycle = 300 * 0.5 * 4; // one full colour cycle (extent·band·colors)

        this.add(
            <Rect width={'fill'} height={'fill'} group={'column'} padding={80} gap={24}>
                <Text fontFamily={'Pixelify Sans'} text={this.label} fontSize={96} fill={'gray'} width={'fill'} align={'start'} />
                <Rect width={'fill'} height={'fill'} clip={true} cornerRadius={32} group={'stack'} fill={'card'}>
                    <DrawnMask ref={maskRef} extent={300} offset={0} />
                </Rect>
            </Rect>
        );

        // Slide the stripes a full colour cycle under the static mask, then back,
        // for a seamless loop.
        yield* sequence(
            maskRef().to({ offset: cycle } as any, 3, easeInOutQuad),
            maskRef().to({ offset: 0 } as any, 3, easeInOutQuad),
        );
    }
}
