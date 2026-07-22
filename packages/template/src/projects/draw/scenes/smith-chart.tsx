import { createScene, createRef, Text, Rect, easeInOut } from "motion-script";
import { SmithChart } from "../nodes/smith-chart";

/**
 * Shows a Smith chart drawn entirely from `Graphics` commands (see
 * {@link SmithChart}). The whole conformal grid — constant-resistance circles,
 * orthogonal constant-reactance arcs clipped to the boundary, the boundary ring
 * and the 360° degree scale — is one command list inside the node's
 * `renderSelf`, with no Canvas 2D and no requestAnimationFrame.
 *
 * The reference HTML is static; here the `orientation` prop is tweened to slowly
 * turn the whole chart about its centre, proving the figure is a live,
 * animatable node rather than a one-shot canvas paint.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });

    const chartRef = createRef<SmithChart>();

    stage.add(
        <Rect width={'fill'} height={'fill'} group={'column'} padding={80} gap={24}>
            <Text fontFamily={'Pixelify Sans'} text={"Smith Chart — draw commands"} fontSize={96} fill={'gray'} width={'fill'} textAlign={'start'} />
            <Rect width={'fill'} height={'fill'} clip={true} cornerRadius={32} group={'stack'} fill={'#030303'}>
                <SmithChart ref={chartRef} radius={360} rotation={90} ink={'#ffffff'} />
            </Rect>
        </Rect>
    );

    // Slowly rotate the whole chart a quarter turn and back for a seamless loop.
    yield* chartRef().to({ rotation: 180 }, 6, easeInOut('quad'));
    yield* chartRef().to({ rotation: 90 }, 6, easeInOut('quad'));
});
