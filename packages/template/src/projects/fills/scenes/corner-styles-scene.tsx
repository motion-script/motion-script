

import { createScene, Rect, Polygon, Polygram, wait } from "motion-script";

/**
 * Visual showcase for corner styles: a circular `rounded` corner and an
 * `angled` chamfer, across rects, polygons, and polygrams.
 */
export default createScene(function* (stage) {
        stage.set({ fill: 'bg' });

        stage.add(
            <Rect width={'fill'} height={'fill'} flow={'horizontal'} gap={48} padding={64} align={{ x: 0, y: 0 }}>
                <Rect width={240} height={240} fill={'tomato'} cornerRadius={48} />
                <Rect width={240} height={240} fill={'tomato'} cornerRadius={48} cornerStyle={'angled'} />
                <Polygon sides={6} width={240} height={240} fill={'#6990DD'} cornerRadius={32} />
                <Polygon sides={6} width={240} height={240} fill={'#6990DD'} cornerRadius={32} cornerStyle={'angled'} />
                <Polygram sides={5} ratio={0.5} width={240} height={240} fill={'#C77DFF'} cornerRadius={20} />
            </Rect>
        );

        yield* wait(1);
});
