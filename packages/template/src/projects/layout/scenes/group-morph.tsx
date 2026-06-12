/** @jsxImportSource @motion-script/core/jsx */

import { Scene, createRef, Rect, Text, easeInOutQuad, wait } from "@motion-script/core";
import { tile } from "./layout-card";

/**
 * Demonstrates animating the `group` prop itself: a single container morphs
 * `row → stack → column` while its children stay put. Because `Rect.group`
 * carries a closure tween that blends the from/to layouts (see `applyGroupProp`
 * in `rect-node.ts`), the tiles interpolate smoothly between the two
 * arrangements — sliding from a horizontal line, into an overlapping pile, then
 * down into a vertical stack — rather than snapping between layouts.
 *
 * The heading text tracks the current mode so it's clear which arrangement the
 * tiles are settling into at each step.
 */
export class GroupMorphScene extends Scene {
    *build() {
        this.set({ fill: 'bg' });

        const stage = createRef<Rect>();
        const heading = createRef<Text>();
        const colors = ['#6990DD', '#E8617C', '#F5C26B'];

        this.add(
            <Rect width={'fill'} height={'fill'} group={'column'} padding={80} gap={24}>
                <Text ref={heading} fontFamily={'Pixelify Sans'} text={'group: row -> stack -> column'} fontSize={96} fill={'gray'} width={'fill'} align={'start'} />
                <Rect
                    ref={stage}
                    width={'fill'} height={'fill'}
                    fill={'card'} borderRadius={32} clip={true}
                    group={'row'} gap={48} padding={64}
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
        yield* stage().to({ group: 'stack' }, 2, easeInOutQuad);
        yield* wait(hold);
        // stack → column: the pile fans out downward into a vertical stack.
        yield* stage().to({ group: 'column' }, 2, easeInOutQuad);
        yield* wait(hold);
        // column → row: close the loop back to where we started.
        yield* stage().to({ group: 'row' }, 2, easeInOutQuad);
    }
}
