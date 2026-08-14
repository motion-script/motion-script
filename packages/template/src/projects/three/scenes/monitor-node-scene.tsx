import {
    createRef, createScene, createSignal, easeInOut, linear, parallel,
    Graphics, Rect, Text,
} from "motion-script";
import { MonitorWall, type MonitorScreen } from "../nodes/monitor-wall";

/**
 * The {@link MonitorWall} node — the `Monitors` scene's inline rig promoted to a
 * reusable node.
 *
 * The split is the point: the node owns the *rig* (camera, lighting, floor, fog,
 * and a bezel/stalk/foot per screen), the scene owns the *content*. So this scene
 * is three screen sources and a couple of `to()` calls, and adding a third
 * monitor was adding a third entry — no placement maths in the scene at all.
 *
 * Both source kinds are here, and both animate:
 *
 *  - **scope / net** — a built `Graphics` command list, rebuilt each frame from
 *    the signals it reads.
 *  - **stats** — a `Node` subtree with real column layout and shaped `Text`,
 *    whose bars follow timeline signals. It is never mounted in the scene tree;
 *    `View3D` binds it to its own asset catalog, context and clock, which is what
 *    lets the webfont shape.
 */

const SCREEN_W = 1024;
const SCREEN_H = 640;
/** Inset of the screen's content from the buffer edge. */
const INSET = 48;

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

    const wall = createRef<MonitorWall>();

    // Phase is a tweened signal rather than elapsed time: it keeps the traces on
    // the timeline, so they scrub and export frame-identically.
    const phase = createSignal(0);
    const amplitude = createSignal(40);     // oscilloscope height, px
    const cpu = createSignal(0.18);         // 0..1, drives the stats screen's bars
    const memory = createSignal(0.44);
    const throughput = createSignal(0.3);   // 0..1, drives the net screen's bars

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
    // Hoisted, not rebuilt per frame — a fresh subtree each frame would re-bind,
    // re-lay-out and defeat the texture cache. Its signals keep it live.
    const stats = (
        <Rect width={SCREEN_W} height={SCREEN_H} fill={"#0b0d12"}
            flow={"vertical"} padding={INSET} gap={22} align={"topLeft"}>
            <Text fontFamily={"Pixelify Sans"} text={"SYSTEM"} fontSize={52} fill={"#7f8ea8"} />

            <Text fontFamily={"Pixelify Sans"} text={"CPU"} fontSize={42} fill={"#e6ecf7"} />
            <Rect width={barTrack} height={44} fill={"#171b24"} cornerRadius={10}
                flow={"freeform"} align={"centerLeft"}>
                <Rect width={barWidth(cpu)} height={44} fill={"#3ddc84"} cornerRadius={10} />
            </Rect>

            <Text fontFamily={"Pixelify Sans"} text={"MEMORY"} fontSize={42} fill={"#e6ecf7"} />
            <Rect width={barTrack} height={44} fill={"#171b24"} cornerRadius={10}
                flow={"freeform"} align={"centerLeft"}>
                <Rect width={barWidth(memory)} height={44} fill={"#6990dd"} cornerRadius={10} />
            </Rect>

            {/* Spacer, so the caption sits on the bottom edge. */}
            <Rect width={"fill"} height={"fill"} fill={"transparent"} />
            <Text fontFamily={"Pixelify Sans"} text={"drawn with nodes"} fontSize={30} fill={"#4c5871"} />
        </Rect>
    );

    // ── Screen 3: added by handing over one more source ──────────────────────
    const net = (): Graphics => {
        const g = new Graphics();
        const w = SCREEN_W - INSET * 2;
        const h = SCREEN_H - INSET * 2;
        const bars = 24;
        const slot = w / bars;

        g.rect({ width: SCREEN_W, height: SCREEN_H }).fill("#120a12");
        g.rect({ width: w, height: h }).stroke({ weight: 2, fill: "#5a2450" });

        // A scrolling traffic histogram. Height is a pure function of
        // (index, phase), so it stays frame-exact under scrubbing.
        for (let i = 0; i < bars; i++) {
            const wave = Math.sin(i * 0.7 - phase() * 0.75) * 0.5 + 0.5;
            const level = (0.15 + wave * 0.85) * throughput();
            const barHeight = Math.max(6, level * (h - 90));
            g.rect({
                x: -w / 2 + slot * (i + 0.5),
                y: -h / 2 + barHeight / 2 + 10,
                width: slot * 0.6,
                height: barHeight,
                cornerRadius: 4,
            }).fill("#e879f9");
        }

        g.text({
            text: "NET  Mb/s",
            fontFamily: "Pixelify Sans", fontSize: 34,
            width: w, height: 40,
            textAlign: "start",
            y: h / 2 - 20,
        }).fill("#e879f9");

        return g;
    };

    // A reactive binding: it re-evaluates whenever a signal any source reads
    // changes, which during a tween is every frame.
    const screens = (): MonitorScreen[] => [
        { key: "scope", source: scope(), width: SCREEN_W, height: SCREEN_H },
        { key: "stats", source: stats, width: SCREEN_W, height: SCREEN_H },
        { key: "net", source: net(), width: SCREEN_W, height: SCREEN_H },
    ];

    stage.add(
        <MonitorWall
            ref={wall}
            width={1760}
            height={960}
            cornerRadius={32}
            orbit={-18}
            spacing={5.4}
            toe={26}
            zoom={18}
            screens={screens}
        />,
    );

    // The rig moves through `to()` on the node; the screens' contents move through
    // their own signals. Neither knows about the other.
    yield* parallel(
        phase(16, 4, linear()),
        wall().to({ orbit: 16 }, 4, easeInOut("quad")),
        amplitude(150, 2, easeInOut("quad")),
        cpu(0.86, 2.4, easeInOut("quad")),
        memory(0.62, 3, easeInOut("quad")),
        throughput(0.85, 2.6, easeInOut("quad")),
    );

    // Push in and warm the fill light.
    yield* parallel(
        phase(34, 4.5, linear()),
        wall().to({ orbit: -16, elevation: 22, zoom: 15, glow: "#d06f5f" }, 4, easeInOut("quad")),
        amplitude(70, 2.5, easeInOut("quad")),
        cpu(0.34, 2.5, easeInOut("quad")),
        memory(0.91, 2, easeInOut("quad")),
        throughput(0.42, 3, easeInOut("quad")),
    );
});
