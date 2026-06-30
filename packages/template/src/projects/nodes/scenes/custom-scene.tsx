

import { createScene, createRef, Path, Rect, easeInOut, parallel, wait, Node, RenderContext, Graphics, Text, Ellipse } from "motion-script";
import { nodeCard } from "./node-card";


class CustomNode extends Node {

    protected renderSelf(ctx: RenderContext): void {
        ctx.draw(new Graphics().rect({ width: 200, height: 200 }).fill('red'));
    }
}

/**
 * Showcases the {@link Path} node.
 * Three SVG paths with `end` animated from 0→1 to draw them on.
 * Left: a triangle. Center: a wave. Right: a heart.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });



    stage.add(
        <CustomNode width={400} height={400} >
            <Ellipse fill={'white'} width={100} height={100} />
        </CustomNode>
    );


    yield* wait(0.3);
});
