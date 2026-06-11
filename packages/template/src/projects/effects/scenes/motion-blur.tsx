/** @jsxImportSource @motion-script/core/jsx */

import { Scene, createRef, Text, Rect, Ellipse, FX, easeInOutQuad, parallel } from "@motion-script/core";

/**
 * Motion blur is velocity-driven, so a static card can't show it — this scene
 * sweeps two pucks across the screen. The top one carries `FX.motionBlur` and
 * smears along its path; the bottom one is identical but un-blurred, for
 * contrast. Both render sharp at the ends where they stop.
 */
export class MotionBlurScene extends Scene {
    *build() {
        this.set({ fill: 'bg' });

        const blurred = createRef<Ellipse>();
        const sharp = createRef<Ellipse>();

        this.add(
            <Rect width={'fill'} height={'fill'} group={'column'} gap={40} padding={60}>
                <Text text={'Motion blur — velocity-driven'} fontSize={28} fill={'white'} width={'fill'} align={'center'} />
                <Rect width={'fill'} height={'fill'} group={'column'} gap={80}>
                    <Ellipse ref={blurred} x={-560} width={120} height={120} fill={'primary'} effects={FX.motionBlur(90, 'centered', 16)} />
                    <Ellipse ref={sharp} x={-560} width={120} height={120} fill={'primary'} />
                </Rect>
            </Rect>
        );

        // Fast sweep right → smear; pause (sharp); fast sweep back. The static
        // node tracks the same path without blur.
        for (let i = 0; i < 2; i++) {
            yield* parallel(
                blurred().moveX(560, 0.5, easeInOutQuad),
                sharp().moveX(560, 0.5, easeInOutQuad),
            );
            yield* parallel(
                blurred().moveX(-560, 0.5, easeInOutQuad),
                sharp().moveX(-560, 0.5, easeInOutQuad),
            );
        }
    }
}
