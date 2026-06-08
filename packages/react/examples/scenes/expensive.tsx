/** @jsxImportSource @motion-script/core/jsx */

import { Scene, createRef, Rect, type BuildStage, parallel } from "@motion-script/core";

export class ExpensiveScene extends Scene {
    *build(stage: BuildStage) {
        this.set({ fill: "#e8c584" })
        const count = 200;
        // randomly place #count rects on the screen and then animate their position and rotation.
        const rects = Array.from({ length: count }, () => createRef<Rect>());
        this.add(
            <>
                {rects.map((ref) => (
                    <Rect
                        ref={ref}

                        width={20}
                        height={20}
                        fill={`hsl(${stage.random(0, 360)}, 70%, 60%)`}
                        x={stage.random(-this.measuredWidth / 2, this.measuredWidth / 2)}
                        y={stage.random(-this.measuredHeight / 2, this.measuredHeight / 2)}
                        rotation={stage.random() * 360}
                    />
                ))}
            </>
        );

        yield* parallel(
            ...rects.map((ref) =>
                ref().to(
                    {
                        x: stage.random(-this.measuredWidth / 2, this.measuredWidth / 2),
                        y: stage.random(-this.measuredHeight / 2, this.measuredHeight / 2),
                        rotation: stage.random() * 360,
                    },
                    8,
                ),
            ),
        );


    }
};
