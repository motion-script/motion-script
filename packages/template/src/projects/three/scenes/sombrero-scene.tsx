import { createRef, createScene, easeInOut, wait, Rect } from "motion-script";
import { Sombrero } from "../nodes/sombrero";

/**
 * The {@link Sombrero} node — the `WaveGrid` scene's inline builder promoted to a
 * reusable node.
 *
 * The scene is now just placement and timing: every knob the builder used to close
 * over is a `@property` on the node, so the wave, the camera and the palette are
 * all driven by ordinary `to()` calls on a ref. Colours interpolate because they
 * declare a mapper and a tween; the boolean `shell` snaps at the end of its tween
 * because that is the only sensible way to interpolate a flag.
 */
export default createScene(function* (stage) {
    stage.set({ fill: "#05070c" });

    const wave = createRef<Sombrero>();

    stage.add(
        <Rect stroke={{ weight: 4, fill: "red" }} clip={true} width={800} height={800}>
            <Sombrero ref={wave} width="fill" height="fill" amplitude={2} orbit={0} />
        </Rect>,
    );

    // The original WaveGrid beats: orbit around while the wave grows.
    yield* wave().to({ orbit: 180, amplitude: 5 }, 4, easeInOut("quad"));

    // Re-tune the wave itself — tighter rings, and a warmer gradient.
    yield* wave().to(
        { orbit: 300, amplitude: 3, frequency: 1.8, trough: "#5b21b6", crest: "#f59e0b" },
        3.5,
        easeInOut("quad"),
    );

    // Pull the camera up and back, and drop the shell. `shell` is a flag, so it
    // switches once at the end of the tween rather than flickering through it.
    yield* wave().to(
        { orbit: 360, elevation: 55, zoom: 46, shell: false },
        3,
        easeInOut("quad"),
    );

    yield* wait(0.5);
});
