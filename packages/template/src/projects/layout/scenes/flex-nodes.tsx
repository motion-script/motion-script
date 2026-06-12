/** @jsxImportSource @motion-script/core/jsx */

import { Scene, createRef, Rect, Row, Column, easeInOutQuad, parallel } from "@motion-script/core";
import { layoutCard, tile } from "./layout-card";

/**
 * Demonstrates the `Row` and `Column` convenience nodes. Unlike `Rect`, they
 * draw nothing — they're pure flex containers that exist only to position their
 * children. Here a `Row` lays out three `Column`s side by side, and each column
 * stacks its own tiles; nesting the two is how you build a layout grid without a
 * single visible wrapper. The middle column's tiles swell and the invisible
 * containers reflow around them, exactly as a `Rect` with `group` would, just
 * without the box.
 */
export class FlexNodesScene extends Scene {
    *build() {
        this.set({ fill: 'bg' });

        const middle = [createRef<Rect>(), createRef<Rect>()];
        const colors = ['#6990DD', '#E8617C', '#F5C26B'];

        this.add(
            layoutCard({
                label: 'Row + Column nodes',
                // The card's own stage just centers the (hugging) Row.
                stage: 'stack',
                children: (
                    <Row gap={48}>
                        {colors.map((color, c) => (
                            <Column gap={48}>
                                {[0, 1].map((r) =>
                                    tile({
                                        ref: c === 1 ? middle[r] : undefined,
                                        color,
                                        width: 200,
                                        height: 200,
                                    })
                                )}
                            </Column>
                        ))}
                    </Row>
                ),
            })
        );

        // Grow then shrink the middle column's tiles; the Row/Column reflow.
        yield* parallel(...middle.map((ref) => ref().to({ width: 320 }, 1.5, easeInOutQuad)));
        yield* parallel(...middle.map((ref) => ref().to({ width: 200 }, 1.5, easeInOutQuad)));
    }
}
