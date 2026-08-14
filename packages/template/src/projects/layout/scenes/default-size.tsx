
import { createScene, createRef, Rect, easeInOut, parallel, Row, wait } from "motion-script";
import { layoutCard, tile } from "./layout-card";

/**
 * Demonstrates `flow="vertical"`: children stack top-to-bottom along the main
 * axis, separated by `gap`. The tiles grow their height in sequence so you can
 * watch the column reflow — siblings push down to make room as each one
 * expands, the defining behaviour of a vertical flex container.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });

    const container = createRef<Rect>();
    stage.add(
        <Rect ref={container} flow="horizontal" height={400} padding={48} gap={48} stroke={{ weight: 4, fill: '#FFFFFF' }}>
            <Rect width={400} fill="#6990DD" />
            <Rect fill="#E8617C" />
            <Rect fill="#E8617C" flex={2} />
            <Rect width={400} fill="#F5C26B" />

        </Rect>
    );
    console.log(container().width);
    yield* wait(4);

});
