/** @jsxImportSource @motion-script/core/jsx */

import { Scene, createRef, Rect, LineGrid, Text, Fills, wait } from "@motion-script/core";

/**
 * Showcases the {@link LineGrid} node. Two grids sit side by side. `stroke`
 * paints the major (division) lines and `subStroke` the minor (subdivision)
 * lines, both as their own union shapes; `fill` paints across the whole grid
 * rect and `shadow` casts off it.
 *
 * The left grid omits `subStroke`, so it defaults to the major `stroke` at half
 * opacity. The right grid sets an explicit, contrasting `subStroke` and then
 * animates its subdivisions count up.
 */
export class LineGridScene extends Scene {
    readonly label = 'Line Grid';

    *build() {
        this.set({ fill: 'bg' });

        const fine = createRef<LineGrid>();
        const pan = createRef<LineGrid>();

        this.add(
            <Rect width={'fill'} height={'fill'} group={'row'} gap={96} padding={96} alignment={{ x: 0, y: 0 }}>
                {/* subStroke omitted → defaults to `stroke` at 50% opacity. `origin`
                    pans the grid behind the fixed rect (tiles to stay full). */}
                <LineGrid
                    ref={pan}
                    width={520}
                    height={520}
                    divisions={4}
                    subdivisions={3}
                    fill={Fills.color('card')}
                    stroke={{ weight: 8, fill: '#6990DD' }}
                    shadow={{ fill: Fills.color('black', { opacity: 0.5 }), dx: 0, dy: 16, blur: 32 }}
                />
                {/* explicit subStroke distinct from the major stroke */}
                <LineGrid
                    ref={fine}
                    width={520}
                    height={520}
                    divisions={4}
                    subdivisions={1}
                    fill={Fills.color('card')}
                    stroke={{ weight: 3, fill: '#C77DFF' }}
                    subStroke={{ weight: 1, fill: '#C77DFF', dash: 4 }}
                    shadow={{ fill: Fills.color('black', { opacity: 0.5 }), dx: 0, dy: 16, blur: 32 }}
                >
                    {/* children stack centred over the grid, like other shapes */}
                    <Rect width={200} height={80} cornerRadius={12} fill={'#C77DFF'} alignment={{ x: 0, y: 0 }}>
                        <Text text={'Centered'} fontSize={28} fill={'white'} />
                    </Rect>
                </LineGrid>
            </Rect>
        );

        yield* wait(0.5);
        // Pan the left grid one full cell diagonally — it tiles to stay full —
        // while the right grid densifies its subdivisions.
        yield* pan().to({ origin: { x: 130, y: 130 } }, 2);
        yield* fine().to({ subdivisions: 4 }, 1.5);
        yield* wait(1);
    }
}
