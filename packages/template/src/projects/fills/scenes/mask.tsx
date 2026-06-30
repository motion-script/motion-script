

import { createScene, createRef, Text, Rect, Ellipse, Image, MaskGroup, easeInOut, parallel, sequence } from "motion-script";

/**
 * Shows a {@link MaskGroup} clipping content with an animated mask shape.
 *
 * The group's first child is the mask (a circle); the remaining child is the
 * content (a photo). In `alpha` mode the mask's coverage drives the content's
 * visibility, so only the part of the photo under the circle shows — a
 * spotlight. The mask animates across and over the image (sliding side to side
 * and pulsing in size) so the reveal is in constant motion, demonstrating that
 * the mask is a live, animatable node rather than a static clip.
 */
export default createScene(function* (stage) {
        stage.set({ fill: 'bg' });

        const maskRef = createRef<Ellipse>();
        const size = 520;

        stage.add(
            <Rect width={'fill'} height={'fill'} group={'column'} padding={80} gap={24}>
                <Text fontFamily={'Pixelify Sans'} text={"Mask Group"} fontSize={96} fill={'gray'} width={'fill'} align={'start'} />
                <Rect width={'fill'} height={'fill'} clip={true} cornerRadius={32} group={'stack'} fill={'card'}>
                    <MaskGroup mode={'alpha'}>
                        {/* First child = mask. The moving circle reveals the photo. */}
                        <Ellipse ref={maskRef} width={size} height={size} fill={'#ffffff'} />
                        {/* Remaining children = masked content. */}
                        <Image src={'kingfisher.jpg'} fit={'fill'} width={1400} height={900} />
                    </MaskGroup>
                </Rect>
            </Rect>
        );

        // Sweep the spotlight left↔right while pulsing its radius, so the reveal
        // is always moving. The final leg returns to the start for a clean loop.
        yield* sequence(
            parallel(
                maskRef().to({ x: -400 }, 1.6, easeInOut('quad')),
                maskRef().to({ width: size * 0.6, height: size * 0.6 }, 1.6, easeInOut('quad')),
            ),
            parallel(
                maskRef().to({ x: 400 }, 2.4, easeInOut('quad')),
                sequence(
                    maskRef().to({ width: size * 1.3, height: size * 1.3 }, 1.2, easeInOut('quad')),
                    maskRef().to({ width: size * 0.6, height: size * 0.6 }, 1.2, easeInOut('quad')),
                ),
            ),
            parallel(
                maskRef().to({ x: 0 }, 1.6, easeInOut('quad')),
                maskRef().to({ width: size, height: size }, 1.6, easeInOut('quad')),
            ),
        );
});
