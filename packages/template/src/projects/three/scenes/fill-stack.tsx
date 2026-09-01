import {
    createScene, createSignal, easeInOut, parallel, wait,
    Fills, Graphics3D, Scene3D, Rect, Row,
    Canvas3D, Camera3D, AmbientLight3D, DirectionalLight3D, Box3D,
} from "motion-script";

/**
 * The two things the fill model buys that a dedicated 3D op could not.
 *
 * **Left** — two 3D fills stacked on one node. They key their scene graph, GPU
 * buffer and texture off `${nodeId}#${paintSlot}`, so if the slots ever collide
 * you see one scene painted twice, or a flicker as each upload mutates the
 * texture the other's queued draw still references.
 *
 * **Right** — a `Canvas3D` with its own `fill` and angled corners. The author's
 * fill layers paint *beneath* the 3D, and the corners come from the rect's own
 * path rather than the manual clip the old composite needed — which is why
 * `cornerStyle: 'angled'` works at all now.
 */

const spin = createSignal(0);
const drift = createSignal(0);

function knot(color: string, y: number): Scene3D {
    return new Scene3D()
        .perspective({ position: [0, 1.4, 5], target: 0, fov: 45 })
        .light({ type: "ambient", intensity: 0.45 })
        .light({ type: "directional", intensity: 2.6 }, { position: [4, 6, 3] })
        .draw(new Graphics3D().torusKnot({
            radius: 1, thickness: 0.3,
            fill: color, roughness: 0.25, metalness: 0.4,
            position: [0, y, 0],
            rotation: [spin() * 0.5, spin(), 0],
        }));
}

export default createScene(function* (stage) {
    stage.set({ fill: "#05070c" });

    stage.add(
        <Row gap={64} align={"center"} width={"fill"} height={"fill"}>
            {/* Two 3D layers on ONE node, the upper one half-transparent. Both
                scenes must be visible and distinct. */}
            <Rect
                width={720}
                height={720}
                cornerRadius={32}
                fill={() => [
                    "#0b0d12",
                    Fills.canvas3D(knot("#e0533d", -0.7)),
                    Fills.canvas3D(knot("#4ea1ff", 0.7), { opacity: 0.55 }),
                ]}
            />

            {/* Angled corners cut the 3D, and red shows through wherever the
                render is transparent — the scene sets no background. */}
            <Canvas3D
                width={720}
                height={720}
                fill={"#8b1e3f"}
                cornerRadius={72}
                cornerStyle={"angled"}
            >
                <Camera3D position={[0, 1.4, 5]} target={0} fov={45} />
                <AmbientLight3D intensity={0.5} />
                <DirectionalLight3D intensity={2.6} position={[4, 6, 3]} />
                <Box3D
                    width={1.8} height={1.8} depth={1.8}
                    fill="#f5c26b" roughness={0.3}
                    position={() => [drift(), 0, 0]}
                    rotation={() => [spin() * 0.4, spin(), 0]}
                />
            </Canvas3D>
        </Row>,
    );

    yield* parallel(
        spin(360, 6, easeInOut("quad")),
        drift(0.9, 3, easeInOut("quad")),
    );
    yield* wait(0.4);
});
