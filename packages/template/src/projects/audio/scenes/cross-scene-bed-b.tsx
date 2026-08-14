

import { createScene, createRef, Text, Rect, easeInOut, wait } from "motion-script";

/**
 * Cross-scene audio (part 2 of 2). This scene starts no sound of its own — yet the
 * music bed from {@link cross-scene-bed-a} is still playing here, having crossed
 * the scene boundary. It keeps going until the file ends or the project ends.
 */
export default createScene(function* (stage) {
        stage.set({ fill: 'bg', padding: 80, flow: 'vertical', gap: 40 });

        const dot = createRef<Rect>();

        stage.add(
            <Rect width={'fill'} height={'fill'} flow={'vertical'} gap={40}>
                <Text fontFamily={'Pixelify Sans'} text={'Cross-scene bed — scene B (bed still playing)'} fontSize={64} fill={'gray'} width={'fill'} textAlign={'start'} />
                <Rect width={'fill'} height={300} fill={'card'} cornerRadius={16} flow={'horizontal'} align={{ x: 0, y: 0 }}>
                    <Rect ref={dot} width={120} height={120} fill={'primary'} cornerRadius={60} />
                </Rect>
            </Rect>
        );

        yield* dot().to({ scale: 1.6 } as any, 1.2, easeInOut('quad'));
        yield* dot().to({ scale: 1 } as any, 1.2, easeInOut('quad'));
        yield* wait(0.4);
});
