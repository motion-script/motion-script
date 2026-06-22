import { createScene, Stage, createRef, Text, Image, easeInOutQuad, Fills, FrameGenerator, parallel, Rect, wait } from "@motion-script/core";
import { ShapeDemoScene, ShapeDemoSpec } from "./shape-demo";

/**
 * Solid color morphing into a linear gradient (and a gradient morphing back to a
 * solid color via the stroke sample). Exercises cross-type fill lerping —
 * frame 0 should read as the flat color, then resolve into the gradient.
 */
export default createScene(function* (stage) {
        stage.set({ fill: 'bg' });



        const fillRef = createRef<Rect>();
        const strokeRef = createRef<Rect>();

        stage.add(
            <Rect width={'fill'} height={'fill'} group={'column'} padding={80} gap={24}>
                <Text fontFamily={'Pixelify Sans'} text={'Fill Lerp'} fontSize={96} fill={'gray'} width={'fill'} align={'start'} />
                <Rect width={'fill'} height={'fill'} group={'row'} gap={80}>
                    <Rect
                        ref={fillRef}
                        width={500} height={500} cornerRadius={32}
                        fill={'primary'}

                    />
                    <Rect
                        ref={strokeRef}
                        width={500} height={500} cornerRadius={32}
                        stroke={{ weight: 8, fill: 'primary' }}

                    />
                </Rect>
            </Rect>
        );

        yield* wait(2);
        yield* fillRef().to({ fill: Fills.linearGradient(['#E8617C', '#F5C26B']) }, 1);
        yield* fillRef().to({ fill: Fills.image('cat.jpg', { fit: 'fill' }) }, 1);
        yield* wait(2);
});
