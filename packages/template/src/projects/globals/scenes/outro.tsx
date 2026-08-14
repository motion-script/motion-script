import { createScene, Text, Rect, wait } from "motion-script";

/**
 * Final scene. The project config excludes the watermark overlay from this one
 * (`exclude: 'outro'`), so an end card can be clean while every other scene is
 * branded — the layer is declared once, not repeated per scene.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg/85', padding: 120, flow: 'vertical', gap: 40 });

    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'vertical'} gap={24} align={'center'}>
            <Text fontFamily={'Pixelify Sans'} text={'no watermark here'} fontSize={90} fill={'white'} />
            <Text fontFamily={'Pixelify Sans'} text={'exclude: "outro"'} fontSize={44} fill={'primary'} />
        </Rect>,
    );

    yield* wait(2);
});
