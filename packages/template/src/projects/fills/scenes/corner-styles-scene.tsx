/** @jsxImportSource @motion-script/core/jsx */

import { Scene, Rect, Polygon, Polygram, wait } from "@motion-script/core";

/**
 * Visual showcase for corner styles: a circular `rounded` corner and an
 * `angled` chamfer, across rects, polygons, and polygrams.
 */
export class CornerStylesScene extends Scene {
    readonly label = 'Corner Styles';

    *build() {
        this.set({ fill: 'bg' });

        this.add(
            <Rect width={'fill'} height={'fill'} group={'row'} gap={48} padding={64} alignment={{ x: 0, y: 0 }}>
                <Rect width={240} height={240} fill={'tomato'} cornerRadius={48} />
                <Rect width={240} height={240} fill={'tomato'} cornerRadius={48} cornerStyle={'angled'} />
                <Polygon sides={6} width={240} height={240} fill={'#6990DD'} cornerRadius={32} />
                <Polygon sides={6} width={240} height={240} fill={'#6990DD'} cornerRadius={32} cornerStyle={'angled'} />
                <Polygram sides={5} ratio={0.5} width={240} height={240} fill={'#C77DFF'} cornerRadius={20} />
            </Rect>
        );

        yield* wait(1);
    }
}
