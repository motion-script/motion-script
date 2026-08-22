import { createScene, createRef, easeInOut, parallel, wait, Rect, Text } from "motion-script";

/**
 * The flat-node 3D transform: the two mirrors, the two out-of-plane rotations,
 * `depth` under a `perspective`, and `backfaceVisible` driving a card flip.
 *
 * Every node here is an ordinary `Rect` with ordinary children — nothing is a 3D
 * object. The tilt is a projection of the node's own plane, the way a browser
 * tilts a `<div>`, so text, corner radii and nested children come along with it.
 */

const FONT = "Inter";

/** One labelled tile, so each demo below is legible on its own. */
const tile = (label: string, body: unknown) => (
    <Rect width="hug" height="hug" flow="vertical" gap={24} align="center">
        {body as never}
        <Text text={label} fontFamily={FONT} fontSize={28} fill="#8b93a7" />
    </Rect>
);

const card = (fill: string, text: string) => (
    <Rect width={220} height={300} cornerRadius={20} fill={fill} flow="freeform">
        <Text text={text} fontFamily={FONT} fontSize={72} fontWeight={700} fill="#0D0F15" />
    </Rect>
);

export default createScene(function* (stage) {
    stage.set({ fill: "bg" });

    const front = createRef<Rect>();
    const back = createRef<Rect>();
    const tilt = createRef<Rect>();
    const dolly = createRef<Rect>();

    stage.add(
        <Rect width="fill" height="fill" flow="horizontal" gap={70} align="center" padding={80}>
            {/* Mirrors: the same node, reflected. Nothing about its box moves. */}
            {tile("flipHorizontal",
                <Rect flipHorizontal width={220} height={300} cornerRadius={20} fill="brand-400" flow="freeform">
                    <Text text="F" fontFamily={FONT} fontSize={120} fontWeight={700} fill="#0D0F15" />
                </Rect>)}
            {tile("flipVertical",
                <Rect flipVertical width={220} height={300} cornerRadius={20} fill="brand-600" flow="freeform">
                    <Text text="F" fontFamily={FONT} fontSize={120} fontWeight={700} fill="#0D0F15" />
                </Rect>)}

            {/* A tilt with a viewpoint: the far edge recedes rather than the
                whole node squashing evenly. */}
            {tile("rotationY + perspective",
                <Rect ref={tilt} transform3D={{ rotationY: 0, perspective: 900 }} width="hug" height="hug" flow="freeform">
                    {card("#E8617C", "3D")}
                </Rect>)}

            {/* translateZ under the same perspective — nearer projects larger. */}
            {tile("depth",
                <Rect ref={dolly} transform3D={{ perspective: 900, depth: 0 }} width="hug" height="hug" flow="freeform">
                    {card("#6990DD", "Z")}
                </Rect>)}

            {/* The 3D block's own Z rotation, which is not the node's `rotation`:
                the box stays where it is and the picture spins inside it. */}
            {tile("rotationZ",
                <Rect transform3D={{ rotationZ: 24, rotationX: 20, perspective: 900 }} width="hug" height="hug" flow="freeform">
                    {card("#9b7ede", "Z")}
                </Rect>)}

            {/* The card flip: two nodes back to back, each hidden exactly while
                the other faces out. */}
            {tile("backfaceVisible: false",
                <Rect width={220} height={300} flow="freeform">
                    <Rect ref={front} transform3D={{ rotationY: 0, perspective: 1200, backfaceVisible: false }} width="hug" height="hug" flow="freeform">
                        {card("#f0c05a", "A")}
                    </Rect>
                    <Rect ref={back} transform3D={{ rotationY: 180, perspective: 1200, backfaceVisible: false }} width="hug" height="hug" flow="freeform">
                        {card("#5ad1a5", "B")}
                    </Rect>
                </Rect>)}
        </Rect>
    );

    yield* wait(0.4);

    yield* parallel(
        tilt().to({ transform3D: { rotationY: 52 } }, 1.4, easeInOut('quad')),
        dolly().to({ transform3D: { depth: 380 } }, 1.4, easeInOut('quad')),
        front().to({ transform3D: { rotationY: 180 } }, 1.4, easeInOut('quad')),
        back().to({ transform3D: { rotationY: 360 } }, 1.4, easeInOut('quad')),
    );

    yield* wait(0.4);
});
