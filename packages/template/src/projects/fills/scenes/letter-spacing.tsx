

import { createScene, createRef, Rect, Text } from "motion-script";

/** Animates a {@link Text} node's `letterSpacing` to spread its glyphs apart. */
export default createScene(function* (stage) {
        stage.set({ fill: 'bg' });

        const letterSpacingText = createRef<Text>();

        stage.add(
            <Rect width={'fill'} height={'fill'} group={'column'} padding={80} gap={24}>
                <Text fontFamily={'Pixelify Sans'} text={"Letter Spacing"} fontSize={96} fill={'gray'} width={'fill'} align={'start'} />
                <Rect width={'fill'} height={'fill'} group={'stack'} cornerRadius={32} fill={'card'} padding={80}>
                    <Text ref={letterSpacingText} text={'Hello'} letterSpacing={10} fontWeight={100} fontSize={100} fill={'white'} />
                </Rect>
            </Rect>
        );

        yield* letterSpacingText().to({ letterSpacing: 20 }, 2);
});
