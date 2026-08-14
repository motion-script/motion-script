

import { createScene, createRef, Rect, Text, easeInOut, wait } from "motion-script";
import { tile } from "./layout-card";

/**
 * Demonstrates animating the `flow` prop itself: a single container morphs
 * `horizontal → freeform → vertical` while its children stay put. Because `Rect.flow`
 * carries a closure tween that blends the from/to layouts (see `applyGroupProp`
 * in `rect-node.ts`), the tiles interpolate smoothly between the two
 * arrangements — sliding from a horizontal line, into an overlapping pile, then
 * down into a vertical stack — rather than snapping between layouts.
 *
 * The heading text tracks the current mode so it's clear which arrangement the
 * tiles are settling into at each step.
 */
export default createScene(function* (stage) {
        stage.set({ fill: 'bg' });

        const container = createRef<Rect>();
        const heading = createRef<Text>();
        const colors = ['#6990DD', '#E8617C', '#F5C26B'];

        stage.add(
            <Rect width={'fill'} height={'fill'} flow={'vertical'} padding={80} gap={24}>
                <Text ref={heading} fontFamily={'Pixelify Sans'} text={'flow: horizontal -> freeform -> vertical'} fontSize={96} fill={'gray'} width={'fill'} textAlign={'start'} />
                <Rect
                    ref={container}
                    width={'fill'} height={'fill'}
                    fill={'card'} cornerRadius={32} clip={true}
                    flow={'horizontal'} gap={48} padding={64}
                >
                    {colors.map((color, i) =>
                        tile({ color, width: 240, height: 240, label: `${i + 1}` })
                    )}
                </Rect>
            </Rect>
        );

        const hold = 0.6;

        yield* wait(hold);
        // row → stack: the horizontal line collapses into a centered pile.
        yield* container().to({ flow: 'freeform' }, 2, easeInOut('quad'));
        yield* wait(hold);
        // stack → column: the pile fans out downward into a vertical stack.
        yield* container().to({ flow: 'vertical' }, 2, easeInOut('quad'));
        yield* wait(hold);
        // column → row: close the loop back to where we started.
        yield* container().to({ flow: 'horizontal' }, 2, easeInOut('quad'));
});
