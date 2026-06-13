/** @jsxImportSource @motion-script/core/jsx */

import { Scene, createRef, Rect, Text, easeInOutQuad, parallel } from "@motion-script/core";
import { layoutCard, tile } from "./layout-card";

/**
 * Demonstrates nesting layouts to compose a realistic structure: a column whose
 * children are themselves rows. The outer column holds a header row (title +
 * badge) and a body row of `flex` panels; one panel is itself a column of
 * stacked chips. This is how real UI is built — flex containers nested inside
 * flex containers, each level hugging or filling independently.
 *
 * The body's two panels animate their `flex` ratio against each other, so the
 * space between them slides back and forth while every nested child reflows to
 * follow — showing that layout propagates cleanly down the tree.
 */
export class NestedScene extends Scene {
    *build() {
        this.set({ fill: 'bg' });

        const left = createRef<Rect>();
        const right = createRef<Rect>();

        this.add(
            layoutCard({
                label: 'Nested layouts',
                stage: 'stack',
                children: (
                    // Outer column: header row on top, body row below.
                    <Rect width={'fill'} height={'fill'} group={'column'} gap={32}>
                        {/* Header row: title hugging-left, badge pinned right. */}
                        <Rect width={'fill'} group={'row'} gap={24} fill={'#161a21'} cornerRadius={24} padding={32}>
                            <Text fontFamily={'Pixelify Sans'} text={'Dashboard'} fontSize={56} fill={'white'} width={'fill'} align={'start'} />
                            <Rect group={'stack'} fill={'primary'} cornerRadius={16} padding={24}>
                                <Text fontFamily={'Pixelify Sans'} text={'PRO'} fontSize={40} fill={'bg'} />
                            </Rect>
                        </Rect>
                        {/* Body row: two flexed panels sharing the remaining height. */}
                        <Rect width={'fill'} height={'fill'} group={'row'} gap={32}>
                            {tile({ ref: left, color: '#6990DD', width: 'fill', height: 'fill', flex: 1, label: 'A' })}
                            {/* Right panel is a nested column of stacked chips. */}
                            <Rect ref={right} height={'fill'} width={'fill'} flex={1} group={'column'} gap={24} fill={'#E8617C'} cornerRadius={24} padding={32}>
                                {tile({ color: '#161a21', width: 'fill', height: 'fill' })}
                                {tile({ color: '#161a21', width: 'fill', height: 'fill' })}
                            </Rect>
                        </Rect>
                    </Rect>
                ),
            })
        );

        // Slide the two body panels' flex ratio so the divider sweeps across.
        yield* parallel(
            left().to({ flex: 3 }, 2, easeInOutQuad),
            right().to({ flex: 1 }, 2, easeInOutQuad),
        );
        yield* parallel(
            left().to({ flex: 1 }, 2, easeInOutQuad),
            right().to({ flex: 3 }, 2, easeInOutQuad),
        );
    }
}
