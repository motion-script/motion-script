import {
    createScene, createSignal, easeInOut, parallel, wait,
    Ellipse, Fills, Graphics3D, Scene3D, Path, Rect, Row, Text,
} from "motion-script";

/**
 * What a `Canvas3D` could not do on its own: 3D painted through arbitrary shape
 * paths.
 *
 * A `canvas3D` fill becomes a shader on the paint, so the ordinary `drawPath` that
 * fills any shape confines it. None of these are special-cased — an `Ellipse`, a
 * `Path` and a run of `Text` all just get a shader, the same way an image fill
 * works. The `Text` case is the real proof: text has no path to union, so it
 * falls through to a per-glyph draw and picks the shader up there.
 */

const spin = createSignal(0);

/**
 * One scene, framed so it reads at any of these sizes.
 *
 * Hand-built rather than written as a `<Canvas3D>` tree, because the point here is
 * to shade a shape that isn't a rect — so what's wanted is the recorded `Scene3D`
 * value itself, which is exactly what a `Canvas3D` would have produced.
 */
function scene(color: string): Scene3D {
    return new Scene3D()
        .perspective({ position: [0, 1.6, 5], lookAt: 0, fov: 45 })
        .background("#0b0d12")
        .light({ type: "ambient", intensity: 0.45 })
        .light({ type: "directional", intensity: 2.6 }, { position: [4, 6, 3] })
        .draw(new Graphics3D().torusKnot({
            radius: 1.1, tube: 0.36,
            color, roughness: 0.25, metalness: 0.4,
            rotation: [spin() * 0.6, spin(), 0],
        }));
}

export default createScene(function* (stage) {
    // A checkerboard behind everything, so a fill escaping its shape is obvious.
    stage.set({ fill: Fills.stripe({ gap: 48, strokeWidth: 24, angle: 45, color: "#151a24" }) });

    stage.add(
        <Rect flow={"vertical"} gap={48} align={"center"} width={"fill"} height={"fill"}>
            <Row gap={48} align={"center"}>
                {/* No rectangular bleed: the ellipse's own path is the clip. */}
                <Ellipse width={420} height={420} fill={() => scene("#e0533d")} />

                {/* A heart, via an arbitrary path. */}
                <Path
                    width={420}
                    height={420}
                    data={"M50,88 C-20,45 8,2 50,26 C92,2 120,45 50,88 Z"}
                    fill={() => Fills.canvas3D(scene("#4ea1ff"))}
                />
            </Row>

            {/* Text has no ckPath to union, so it draws per glyph — and the
                shader carries across the whole run rather than restarting. */}
            <Text
                text={"DEPTH"}
                fontFamily={"Pixelify Sans"}
                fontSize={260}
                fill={() => scene("#3ddc84")}
            />
        </Rect>,
    );

    yield* parallel(spin(360, 6, easeInOut("quad")));
    yield* wait(0.4);
});
