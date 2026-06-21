/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, Text, Rect, AFX, fadeIn, easeInOutQuad, wait } from "@motion-script/core";

/**
 * Cross-scene audio (part 1 of 2). Starts a music bed with `startSound` and never
 * stops it. Because it is left open, the sound continues across the scene cut into
 * {@link cross-scene-bed-b} and only ends when the file finishes or the project
 * ends — start once, let it run. A `fadeIn` gives it a smooth entrance.
 */
export default createScene(function* (stage) {
        stage.set({ fill: 'bg', padding: 80, group: 'column', gap: 40 });

        const bar = createRef<Rect>();

        stage.add(
            <Rect width={'fill'} height={'fill'} group={'column'} gap={40}>
                <Text fontFamily={'Pixelify Sans'} text={'Cross-scene bed — scene A'} fontSize={80} fill={'gray'} width={'fill'} align={'start'} />
                <Rect width={'fill'} height={120} fill={'card'} cornerRadius={16} padding={16} group={'row'} align={{ x: -1, y: 0 }}>
                    <Rect ref={bar} width={40} height={'fill'} fill={'primary'} cornerRadius={8} />
                </Rect>
            </Rect>
        );

        // Start the bed and DON'T stop it — it spills into the next scene.
        stage.startSound('song.mp3', { volume: 0.8, filters: AFX.volume(fadeIn(1)) });

        yield* bar().to({ width: 'fill' } as any, 3, easeInOutQuad);
        yield* wait(0.4);
});
