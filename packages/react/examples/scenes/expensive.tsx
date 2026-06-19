/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, Rect, parallel } from "@motion-script/core";

const ExpensiveScene = createScene(function* (stage) {
    stage.set({ fill: "#e8c584" });
    const count = 200;
    const w = stage.viewport.width;
    const h = stage.viewport.height;
    // randomly place #count rects on the screen and then animate their position and rotation.
    const rects = Array.from({ length: count }, () => createRef<Rect>());
    stage.add(
        <>
            {rects.map((ref) => (
                <Rect
                    ref={ref}
                    width={20}
                    height={20}
                    fill={`hsl(${stage.random(0, 360)}, 70%, 60%)`}
                    x={stage.random(-w / 2, w / 2)}
                    y={stage.random(-h / 2, h / 2)}
                    rotation={stage.random() * 360}
                />
            ))}
        </>
    );

    yield* parallel(
        ...rects.map((ref) =>
            ref().to(
                {
                    x: stage.random(-w / 2, w / 2),
                    y: stage.random(-h / 2, h / 2),
                    rotation: stage.random() * 360,
                },
                8,
            ),
        ),
    );
});

export default ExpensiveScene;
