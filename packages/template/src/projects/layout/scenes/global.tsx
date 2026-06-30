

import { createScene, createRef, Rect, Ellipse, Image } from "motion-script";

/**
 * Demonstrates `node.global` — a node's position resolved into absolute scene
 * (world) space, folding in its parent's offset.
 *
 * `circleA` lives inside a parent shifted to `(200, 100)`, with its own local
 * offset `(0, 100)` — so its *world* position is `(200, 200)`, not `(0, 100)`.
 * `circleB` sits at the scene root and binds its `x`/`y` to `circleA.global`, so
 * it lands exactly on circleA regardless of the parent's offset. (Both share the
 * root's origin, so no parent compensation is needed.)
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });

    const circleA = createRef<Rect>();
    const circleB = createRef<Rect>();

    stage.add(
        <>
            <Rect x={200} y={40} group={'stack'} rotation={30} >
                <Rect ref={circleA} rotation={20} x={0} y={80} width={600} height={400} fill={'card'} stroke={{ weight: 2, fill: 'primary' }} />
            </Rect>
            <Rect
                ref={circleB}
                rotation={() => circleA().global.rotation}
                width={100} height={200} fill={'red'}
                x={() => circleA().global.topRight.x}
                y={() => circleA().global.topRight.y}
            />
        </>
    );
    circleA().save();
    yield* circleA().moveTo(200, 300, 2);
    yield* circleA().restore(2);
});

