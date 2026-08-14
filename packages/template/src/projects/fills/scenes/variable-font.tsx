

import { createScene, createRef, Rect, Text } from "motion-script";

/**
 * Animates a {@link Text} node's `fontWeight` along a variable font's weight
 * axis, with a dashed stroke outlining the glyphs.
 */
export default createScene(function* (stage) {
        stage.set({ fill: 'bg' });

        const variableFontText = createRef<Text>();

        stage.add(
            <Rect width={'fill'} height={'fill'} flow={'vertical'} padding={80} gap={24}>
                <Text fontFamily={'Pixelify Sans'} text={"Variable Font"} fontSize={96} fill={'gray'} width={'fill'} textAlign={'start'} />
                <Rect width={'fill'} height={'fill'} flow={'freeform'} cornerRadius={32} fill={'card'} padding={80}>
                    <Text ref={variableFontText} text={'MS'} fontSize={200} stroke={{ weight: 2, fill: 'white', dash: 5 }} />
                </Rect>
            </Rect>
        );

        yield* variableFontText().to({ fontWeight: 900 }, 2);
});
