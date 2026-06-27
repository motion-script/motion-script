/** @jsxImportSource @motion-script/core/jsx */

import { createScene, Rect, Camera, Row, Column, Fills } from "@motion-script/core";

/**
 * TEMPORARY verification scene for the `overlay` paint layer.
 *
 * Each card has a green fill + a blue child + a thick yellow stroke + a
 * semi-transparent red `overlay`. Correct rendering:
 *   - the red overlay tints BOTH the green fill AND the blue child
 *   - the overlay stays inside the rounded corners (clipped to silhouette)
 *   - the yellow stroke sits ON TOP of the red overlay (under-stroke)
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });

    const overlay = Fills.image('background.jpg', { opacity: 0.2 });

    stage.add(
        <Row gap={64} align="center">
            {/* Rect: fill + child + stroke + overlay */}
            <Rect
                width={300} height={300} cornerRadius={40}
                fill={'#2ecc71'}
                stroke={{ weight: 24, fill: '#f5c26b' }}
                overlay={overlay}
            >
                <Rect width={180} height={180} fill={'#3498db'} />
            </Rect>

            {/* Camera: proves inheritance — viewport card with overlay over its world */}
            <Camera
                width={300} height={300} cornerRadius={40}
                fill={'#2ecc71'}
                stroke={{ weight: 24, fill: '#f5c26b' }}
                overlay={overlay}
            >
                <Rect width={180} height={180} fill={'#3498db'} />
            </Camera>

            {/* Column container: proves FlexNode inheritance */}
            <Column gap={20} padding={30} cornerRadius={40}
                fill={'#2ecc71'}
                stroke={{ weight: 24, fill: '#f5c26b' }}
                overlay={overlay}
            >
                <Rect width={160} height={70} fill={'#3498db'} />
                <Rect width={160} height={70} fill={'#9b59b6'} />
            </Column>
        </Row>
    );

    // Hold a beat so `last`/a mid frame is well-defined.
    yield* stage.to({ zoom: 1 }, 0.5);
});
