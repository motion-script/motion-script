import {
    createScene, createSignal, easeInOut, linear, parallel,
    Graphics, Graphics3D, Rect, Tex, Text, View3D, type SurfaceSource3D,
} from "motion-script";

/**
 * Two monitors, each showing a `Tex.surface` — 2D content rasterized offscreen
 * and bound to a 3D material.
 *
 * The point of the scene is that the two screens are authored in the two ways a
 * surface source accepts, and both animate:
 *
 *  - **left** — a built `Graphics` command list, whose trace is phase-driven.
 *  - **right** — a `Node` subtree (`Rect`/`Text` in a column layout), whose bars
 *    are driven by timeline signals.
 *
 * Neither is a child of the `View3D`, and neither has a name: they are values
 * handed to `Tex.surface`. The node binds a `Node` source to its own asset
 * catalog, context and clock, which is what lets its webfont shape.
 */

const SCREEN_W = 1024;
const SCREEN_H = 640;
/** Inset of the screen's content from the buffer edge. */
const INSET = 48;

/** Panel size in world units, matching the buffer's aspect so nothing stretches. */
const PANEL_W = 4;
const PANEL_H = PANEL_W * (SCREEN_H / SCREEN_W);
const BEZEL = 0.12;

/** A monitor: bezel box, screen quad just proud of its face, stalk and foot. */
function monitor(g3: Graphics3D, key: string, source: SurfaceSource3D, x: number, yaw: number): Graphics3D {
    return g3.group({ position: [x, 0.35, 0], rotation: [0, yaw, 0], key: `monitor:${key}` }, m => m
        .box({
            width: PANEL_W + BEZEL * 2, height: PANEL_H + BEZEL * 2, depth: 0.18,
            color: "#15181f", roughness: 0.55, metalness: 0.2,
        })
        // `unlit` so the screen reads as its own light source; a lit material
        // would tint the texture with the scene's lighting and read muddy.
        .plane({
            width: PANEL_W, height: PANEL_H,
            position: [0, 0, 0.095],
            unlit: true,
            map: Tex.surface(source, SCREEN_W, SCREEN_H, { key }),
        })
        .box({
            width: 0.24, height: 0.9, depth: 0.24,
            position: [0, -(PANEL_H / 2 + BEZEL) - 0.45, 0],
            color: "#0f1218", roughness: 0.6,
        })
        .box({
            width: 1.6, height: 0.1, depth: 0.7,
            position: [0, -(PANEL_H / 2 + BEZEL) - 0.92, 0],
            color: "#0f1218", roughness: 0.6,
        }),
    );
}

/** Oscilloscope trace, phase-shifted and enveloped so it lands on the axis. */
function trace(phase: number, amplitude: number): { x: number; y: number }[] {
    const span = SCREEN_W - INSET * 2;
    const points: { x: number; y: number }[] = [];
    for (let i = 0; i <= 96; i++) {
        const u = i / 96;
        points.push({
            x: (u - 0.5) * span,
            y: -Math.sin(u * Math.PI * 6 - phase) * amplitude * Math.sin(u * Math.PI),
        });
    }
    return points;
}

export default createScene(function* (stage) {
    stage.set({ fill: "#05070c" });

    const orbit = createSignal(-18);        // camera yaw, degrees
    const phase = createSignal(0);          // trace phase, radians
    const amplitude = createSignal(40);     // oscilloscope height, px
    const cpu = createSignal(0.18);         // 0..1, drives the right screen's bars
    const memory = createSignal(0.44);

    const barTrack = SCREEN_W - INSET * 2;
    // Reactive width: passing the callback lets the bar follow the signal without
    // a tween of its own.
    const barWidth = (value: () => number) => () => 48 + value() * (barTrack - 48);

    // ── Screen 1: a Graphics command list ────────────────────────────────────
    const scope = (): Graphics => {
        const g = new Graphics();
        const w = SCREEN_W - INSET * 2;
        const h = SCREEN_H - INSET * 2;

        g.rect({ width: SCREEN_W, height: SCREEN_H }).fill("#04120e");
        g.rect({ width: w, height: h }).stroke({ weight: 2, fill: "#12634a" });

        // Graticule. Each line closes its own stroke, so they paint as separate
        // hairlines rather than one union.
        for (let i = 1; i < 6; i++) {
            const x = -w / 2 + (w / 6) * i;
            g.line({ points: [{ x, y: -h / 2 }, { x, y: h / 2 }] })
                .stroke({ weight: 1, fill: "#0b3b2a" });
        }
        g.line({ points: [{ x: -w / 2, y: 0 }, { x: w / 2, y: 0 }] })
            .stroke({ weight: 1, fill: "#0b3b2a" });

        g.line({ points: trace(phase(), amplitude()) })
            .stroke({ weight: 6, fill: "#2ee88a", cap: "round", join: "round" });

        g.text({
            text: "CH1  20mV/div",
            fontFamily: "Pixelify Sans", fontSize: 34,
            width: w, height: 40,
            textAlign: "start",
            y: h / 2 - 20,
        }).fill("#2ee88a");

        return g;
    };

    // ── Screen 2: a node subtree, laid out normally ──────────────────────────
    // Hoisted rather than rebuilt per frame: a fresh subtree each frame would
    // re-bind, re-lay-out and defeat the texture cache. Its signals keep it live.
    const stats = (
        <Rect width={SCREEN_W} height={SCREEN_H} fill={"#0b0d12"}
            group={"column"} padding={INSET} gap={22} align={"topLeft"}>
            <Text fontFamily={"Pixelify Sans"} text={"SYSTEM"} fontSize={52} fill={"#7f8ea8"} />

            <Text fontFamily={"Pixelify Sans"} text={"CPU"} fontSize={42} fill={"#e6ecf7"} />
            <Rect width={barTrack} height={44} fill={"#171b24"} cornerRadius={10}
                group={"stack"} align={"centerLeft"}>
                <Rect width={barWidth(cpu)} height={44} fill={"#3ddc84"} cornerRadius={10} />
            </Rect>

            <Text fontFamily={"Pixelify Sans"} text={"MEMORY"} fontSize={42} fill={"#e6ecf7"} />
            <Rect width={barTrack} height={44} fill={"#171b24"} cornerRadius={10}
                group={"stack"} align={"centerLeft"}>
                <Rect width={barWidth(memory)} height={44} fill={"#6990dd"} cornerRadius={10} />
            </Rect>

            {/* Spacer, so the caption sits on the bottom edge. */}
            <Rect width={"fill"} height={"fill"} fill={"transparent"} />
            <Text fontFamily={"Pixelify Sans"} text={"drawn with nodes"} fontSize={30} fill={"#4c5871"} />
        </Rect>
    );

    stage.add(
        <View3D
            width={1760}
            height={960}
            cornerRadius={32}
            graphics3D={() => {
                const g3 = new Graphics3D();
                const radians = (orbit() * Math.PI) / 180;
                g3.perspective({
                    position: [Math.sin(radians) * 13, 2.4, Math.cos(radians) * 13],
                    lookAt: [0, 0.2, 0],
                    fov: 42,
                })
                    .background("#080a10")
                    .fog({ type: "linear", color: "#080a10", near: 15, far: 36 })
                    .ambient({ intensity: 0.5 })
                    .directional({ intensity: 1.8, position: [5, 8, 6] })
                    .point({ intensity: 40, position: [0, 1, 5], color: "#5f7fd0" })
                    .plane({
                        width: 60, height: 60,
                        rotation: [-90, 0, 0], position: [0, -2.1, 0],
                        color: "#11141c", roughness: 0.85,
                    });

                monitor(g3, "scope", scope(), -3.1, 22);
                monitor(g3, "stats", stats, 3.1, -22);
                return g3;
            }}
        />,
    );

    yield* parallel(
        phase(16, 4, linear()),
        orbit(16, 4, easeInOut("quad")),
        amplitude(150, 2, easeInOut("quad")),
        cpu(0.86, 2.4, easeInOut("quad")),
        memory(0.62, 3, easeInOut("quad")),
    );
    yield* parallel(
        phase(34, 4.5, linear()),
        orbit(-16, 4, easeInOut("quad")),
        amplitude(70, 2.5, easeInOut("quad")),
        cpu(0.34, 2.5, easeInOut("quad")),
        memory(0.91, 2, easeInOut("quad")),
    );
});
