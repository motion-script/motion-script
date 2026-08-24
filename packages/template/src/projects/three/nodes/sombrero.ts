import {
    Geo, Graphics3D, Scene3D, Mat, property, Canvas3D,
    type Color, type NodeConfig, type NormalizedColor, type Canvas3DProps,
} from "motion-script";
import { lerpColor, orbitOf, orbitPosition, resolveColor, snapFlag } from "./attributes";

export interface SombreroProps extends Canvas3DProps {
    /** Half-extent of the plate: x and z run `-range … +range`. Default 10. */
    range: number;
    /**
     * Grid resolution per axis — `(segments + 1)²` vertices. Default 70.
     *
     * Tweenable, but *structural*: a three geometry is immutable, so every
     * intermediate value reallocates the whole buffer. Set it once.
     */
    segments: number;
    /** Peak wave height. The natural thing to animate. Default 2. */
    amplitude: number;
    /** Ripples per world unit — how tightly packed the rings are. Default 1. */
    frequency: number;
    /**
     * How fast the rings travel outward, in radians per second. Default 5.
     *
     * **Set this once rather than tweening it.** Phase is `time × speed`, so
     * changing speed retroactively rescales all elapsed time and the wave jumps.
     * Everything else here is safe to animate.
     */
    speed: number;
    /** Camera orbit about the Y axis, in **degrees**. Animate to spin. */
    orbit: number;
    /** Camera elevation above the ground plane, in **degrees**. */
    elevation: number;
    /** Camera distance from the origin. */
    zoom: number;
    /** Vertical field of view, in **degrees**. Default 50. */
    fov: number;
    /** Colour at the wave troughs. Blended per vertex toward {@link crest}. */
    trough: Color;
    /** Colour at the wave crests. */
    crest: Color;
    /** Draw the translucent bounding shell and its wireframe. Default true. */
    shell: boolean;
    /** Height of the shell box. Default 10. */
    shellHeight: number;
    /** Colour of the translucent shell. */
    shellColor: Color;
    /** Colour of the shell's wireframe edges. */
    edgeColor: Color;
    /** Scene background. */
    background: Color;
}

/**
 * The original framing from the `WaveGrid` scene — camera at `[35, 18, 0]` — kept
 * in spherical terms so `orbit`/`elevation`/`zoom` each get a sensible baseline.
 */
const DEFAULT_VIEW = orbitOf({ x: 35, y: 18, z: 0 });

/** Low enough that the shell tints the surface rather than hiding it. */
const SHELL_OPACITY = 0.05;
const EDGE_OPACITY = 0.4;

/**
 * The classic "sombrero" wave — a radial ripple `sin(r) / √(r² + 1)` deformed
 * across a dense grid, with a per-vertex height gradient, computed normals, and a
 * translucent back-face shell with wireframe edges.
 *
 * This is the `WaveGrid` scene's inline builder promoted to a reusable node.
 * Extends {@link Canvas3D} rather than `Node2D`, so it inherits the whole bridge into
 * the 3D renderer and only has to override {@link canvas3D} — the one seam both the
 * real render and the asset-tracking replay go through.
 *
 *   <Sombrero width="fill" height="fill" amplitude={2} />
 *   yield* wave().to({ amplitude: 5, orbit: 180 }, 4, easeInOut('quad'));
 *
 * Every knob is a `@property`, so it takes a constant, a `() => signal()` binding
 * or a `to()` tween interchangeably. The colours declare a `mapper` (CSS string →
 * RGBA tuple, resolved once per write instead of per vertex per frame) and a
 * `tween` (per-channel lerp) — a `Color` prop without both would snap at the end
 * of a tween and re-parse ~5,000 strings a frame.
 *
 * Nothing accumulates: the surface is a pure function of `(x, z, time)`, so frame
 * N is identical whether the playhead arrived by playing or by scrubbing.
 */
export class Sombrero extends Canvas3D<SombreroProps> {

    @property({ default: 10 }) declare range: number;
    @property({ default: 70 }) declare segments: number;
    @property({ default: 2 }) declare amplitude: number;
    @property({ default: 1 }) declare frequency: number;
    @property({ default: 5 }) declare speed: number;

    @property({ default: DEFAULT_VIEW.orbit }) declare orbit: number;
    @property({ default: DEFAULT_VIEW.elevation }) declare elevation: number;
    @property({ default: DEFAULT_VIEW.distance }) declare zoom: number;
    @property({ default: 50 }) declare fov: number;

    @property({ default: "hsl(216 100% 50%)", mapper: resolveColor, tween: lerpColor })
    declare trough: Color;
    @property({ default: "hsl(72 100% 50%)", mapper: resolveColor, tween: lerpColor })
    declare crest: Color;

    // A boolean has no in-between, but it still needs a `tween` to animate at all:
    // `to()` only drives keys that are numeric or carry a tween function, so
    // without this `to({ shell: false })` would silently do nothing.
    @property({ default: true, tween: snapFlag }) declare shell: boolean;
    @property({ default: 10 }) declare shellHeight: number;
    @property({ default: "#88ccff", mapper: resolveColor, tween: lerpColor })
    declare shellColor: Color;
    @property({ default: "#ffffff", mapper: resolveColor, tween: lerpColor })
    declare edgeColor: Color;

    @property({ default: "#1a1a1a", mapper: resolveColor, tween: lerpColor })
    declare background: Color;

    constructor(props?: NodeConfig<Sombrero, SombreroProps>) {
        super(props as NodeConfig<Canvas3D<SombreroProps>, SombreroProps>);
    }

    protected override buildScene3D(): Scene3D {
        const scene = new Scene3D();
        const g3 = new Graphics3D();
        const range = this.range;
        const amplitude = this.amplitude;
        const frequency = this.frequency;
        // Phase from the node's elapsed time, not an accumulator — that is what
        // keeps the wave seekable.
        const phase = this.time.elapsed * this.speed;

        const trough = this.trough as NormalizedColor;
        const crest = this.crest as NormalizedColor;
        // The unit wave lands in [-1, 1], so dividing the vertex height back out
        // gives the gradient's 0..1 position. Guarded: a flat surface has no range
        // to normalise against, and would divide by zero.
        const inverse = amplitude !== 0 ? 1 / amplitude : 0;

        scene.perspective({
            fov: this.fov,
            position: orbitPosition({
                orbit: this.orbit,
                elevation: this.elevation,
                distance: this.zoom,
            }),
            lookAt: 0,
        })
            .background(this.background)
            .light({ type: "ambient", intensity: 0.4 })
            .light({ type: "directional", intensity: 1.5 }, { position: [10, 20, 10] });

        // The deformed surface. `vertex` is evaluated across the grid each
        // frame; `color` gives the per-vertex height gradient.
        g3.mesh(
            Geo.parametric({
                segments: Math.max(1, Math.round(this.segments)),
                vertex: (u, v) => {
                    const x = (u - 0.5) * 2 * range;
                    const z = (v - 0.5) * 2 * range;
                    return { x, y: sombreroHeight(x, z, phase, frequency) * amplitude, z };
                },
                // Returns a resolved tuple, which is a `Color` like any other —
                // so the gradient costs a lerp per vertex, not a parse.
                color: (_u, _v, p) =>
                    lerpColor(trough, crest, clamp01((p.y * inverse + 1) / 2)),
                computeNormals: true,
            }),
            Mat.phong({
                side: "double",
                vertexColors: true,
                shininess: 80,
                specular: "#444444",
            }),
            { key: "surface" },
        );

        if (this.shell) this.addShell(g3, range);

        return scene.draw(g3);
    }

    /**
     * The translucent shell and its wireframe edges. `side: "back"` and
     * `depthWrite: false` are what stop the shell from occluding the surface
     * inside it.
     *
     * Keyed, so toggling `shell` doesn't renumber anything — the surface above
     * keeps its cached GPU geometry when the shell comes and goes.
     */
    private addShell(g3: Graphics3D, range: number): void {
        const box = { width: range * 2, height: this.shellHeight, depth: range * 2 };

        g3.box({
            ...box,
            unlit: true,
            color: this.shellColor,
            opacity: SHELL_OPACITY,
            transparent: true,
            side: "back",
            depthWrite: false,
            key: "shell",
        })
            .line({
                geometry: Geo.edges(Geo.box(box)),
                mode: "segments",
                color: this.edgeColor,
                opacity: EDGE_OPACITY,
                key: "shell-edges",
            });
    }
}

/**
 * Soft-denominator "sombrero" wave — numerically stable at r = 0, where the
 * textbook `sin(r) / r` is undefined and leaves a spike in the middle of the mesh.
 */
function sombreroHeight(x: number, z: number, phase: number, frequency: number): number {
    const distance = Math.hypot(x, z);
    return Math.sin(distance * frequency - phase) / Math.sqrt(distance * distance + 1);
}

function clamp01(value: number): number {
    return value < 0 ? 0 : value > 1 ? 1 : value;
}
