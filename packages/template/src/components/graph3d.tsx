import {
    Geo, Graphics3D, Mat, Scene3D,
    type Color, type NodeConfig, type Scene3DProps, type Vector3Input,
} from "motion-script";
import { compileExpressionCached } from "./expression";

/** One plotted surface, `z = f(x, y)`. */
export interface Formula {
    /** Unique identifier for the formula. */
    id: string | number;
    /**
     * The mathematical expression string (e.g., 'sin(x) + cos(y)').
     * Evaluated as z = f(x, y).
     */
    expression: string;
    /** Hex color code or CSS color string for the rendered mesh. */
    color: string;
    /** Whether the formula is currently visible on the graph. Defaults to true. */
    visible?: boolean;
    /** Opacity of the rendered mesh (0.0 to 1.0). Defaults to 0.9. */
    opacity?: number;
}

/**
 * Configuration options for the camera.
 *
 * **A note on the interaction flags.** `enableRotate`/`enablePan`/`enableZoom`/
 * `enableDamping`/`dampingFactor` come from OrbitControls, which drives a camera
 * from live mouse input in an interactive page. Motion Script renders a timeline:
 * there is no pointer, and damping is an *accumulator* — its output depends on
 * how many frames have elapsed, which would make a scrubbed frame differ from a
 * played one and break export determinism.
 *
 * So those five fields are accepted for interface compatibility but have no
 * effect here. What *is* honoured: {@link initialPosition} places the camera, and
 * {@link minZoom}/{@link maxZoom} clamp its distance from the target. To move the
 * camera, animate {@link Graph3DProps.orbit} / {@link Graph3DProps.zoom} from the
 * timeline — that stays seekable.
 */
export interface CameraControls {
    /** Initial X, Y, Z position of the camera. */
    initialPosition?: { x: number; y: number; z: number };
    /** Minimum allowed zoom distance (OrbitControls minDistance). */
    minZoom?: number;
    /** Maximum allowed zoom distance (OrbitControls maxDistance). */
    maxZoom?: number;
    /** Enable or disable user rotation (orbiting). Defaults to true. */
    enableRotate?: boolean;
    /** Enable or disable user panning. Defaults to true. */
    enablePan?: boolean;
    /** Enable or disable user zooming. Defaults to true. */
    enableZoom?: boolean;
    /** Enable smooth damping for camera movements. Defaults to true. */
    enableDamping?: boolean;
    /** Damping factor (inertia) if enableDamping is true. Defaults to 0.05. */
    dampingFactor?: number;
}

/** Configuration options for the 3D grid and axes. */
export interface GridControls {
    /** Whether to display the helper grid. Defaults to true. */
    showGrid?: boolean;
    /** Total size of the grid (width and depth). Defaults to 20. */
    size?: number;
    /** Number of divisions across the grid. Defaults to 20. */
    divisions?: number;
    /** Color of the center lines (axes). */
    colorCenterLine?: string | number;
    /** Color of the grid lines. */
    colorGrid?: string | number;
    /** Whether to display the primary X, Y, Z axes helper. Defaults to true. */
    showAxes?: boolean;
    /** Length of the axes helper lines. Defaults to 10. */
    axesSize?: number;
}

export interface Graph3DProps extends Scene3DProps {
    /** Surfaces to plot. Each is evaluated as `z = f(x, y)` over the domain. */
    formulas?: Formula[];
    camera?: CameraControls;
    grid?: GridControls;
    /** Half-width of the plotted domain: x and y run `-domain … +domain`. Default 10. */
    domain?: number;
    /**
     * Surface resolution per axis. Default 100, i.e. ~10k vertices per formula.
     * Lower it when plotting many formulas at once.
     */
    segments?: number;
    /**
     * Clamp `|z|` to this. Default 20. Without it a function with an asymptote
     * (`1/x`, `tan`) produces near-infinite vertices that stretch the mesh across
     * the whole scene and wreck the camera framing.
     */
    maxHeight?: number;
    /** Camera orbit angle about the Y axis, in **degrees**. Animate to spin. */
    orbit?: number;
    /**
     * Camera elevation above the ground plane, in **degrees**. 0 is edge-on, 90 is
     * straight down. Default derived from `camera.initialPosition`.
     */
    elevation?: number;
    /** Camera distance from the origin. Clamped by `camera.minZoom`/`maxZoom`. */
    zoom?: number;
    /** Scene background. Default `#111827`, matching the reference. */
    background?: Color;
}

const DEFAULT_POSITION = { x: 15, y: 12, z: 18 };

/**
 * A 3D function grapher — plots any number of `z = f(x, y)` surfaces with a
 * helper grid and axes.
 *
 * Extends {@link Scene3D} (which is itself a `Node`) rather than `Node` directly:
 * `Scene3D` owns the bridge from the 2D scene graph into the 3D renderer, so
 * subclassing it means this node only has to describe *what* to draw. It
 * overrides `scene3D`, the same single seam the real render and the asset-tracking
 * replay both go through.
 *
 *   <Graph3D
 *       width="fill" height="fill"
 *       formulas={[{ id: 1, expression: 'sin(sqrt(x^2 + y^2))', color: '#3B82F6' }]}
 *       orbit={() => spin()}
 *   />
 *
 * Everything is derived from props each frame, so a formula list that changes —
 * or an `orbit` driven by a signal — animates without any extra machinery, and
 * scrubbing lands on identical pixels.
 */
export class Graph3D extends Scene3D<Graph3DProps> {
    // Not `_props` — the base Node already owns a field by that name, and a
    // private member can't shadow an inherited one.
    private readonly _config: Graph3DProps;

    constructor(props?: NodeConfig<Graph3D, Graph3DProps>) {
        super(props as NodeConfig<Scene3D<Graph3DProps>, Graph3DProps>);
        this._config = (props ?? {}) as Graph3DProps;
    }

    /** Read a prop that may have been supplied as a reactive callback. */
    private read<K extends keyof Graph3DProps>(key: K): Graph3DProps[K] {
        const value = this._config[key];
        return typeof value === "function" && key !== "scene"
            ? (value as () => Graph3DProps[K])()
            : value;
    }

    protected override scene3D(g: Graphics3D): Graphics3D {
        const domain = (this.read("domain") as number) ?? 10;
        const segments = (this.read("segments") as number) ?? 100;
        const maxHeight = (this.read("maxHeight") as number) ?? 20;
        const grid = ((this.read("grid") as GridControls) ?? {});
        const camera = ((this.read("camera") as CameraControls) ?? {});
        const formulas = ((this.read("formulas") as Formula[]) ?? []);

        this.applyCamera(g, camera);

        g.background((this.read("background") as Color) ?? "#111827");

        // Lighting mirrors the reference: a soft ambient fill plus a key light and
        // a weaker back light, so the underside of a surface stays readable when
        // the camera orbits beneath it.
        g.ambient({ intensity: 0.4 })
            .directional({ intensity: 0.6, position: [10, 20, 10] })
            .directional({ intensity: 0.4, position: [-10, -20, -10] });

        if (grid.showGrid !== false) this.addGrid(g, grid);
        if (grid.showAxes !== false) this.addAxes(g, grid.axesSize ?? 10);

        for (const formula of formulas) {
            this.addSurface(g, formula, domain, segments, maxHeight);
        }

        return g;
    }

    /** Place the camera from the orbit/elevation/zoom props, or the raw position. */
    private applyCamera(g: Graphics3D, camera: CameraControls): void {
        const start = camera.initialPosition ?? DEFAULT_POSITION;

        // The default framing comes from `initialPosition`, decomposed into
        // spherical coordinates so `orbit`/`elevation`/`zoom` can each override one
        // axis of it without the author having to restate the others.
        const baseDistance = Math.hypot(start.x, start.y, start.z) || 1;
        const baseOrbit = Math.atan2(start.z, start.x) * (180 / Math.PI);
        const baseElevation = Math.asin(clamp(start.y / baseDistance, -1, 1)) * (180 / Math.PI);

        const orbit = (this.read("orbit") as number) ?? baseOrbit;
        const elevation = (this.read("elevation") as number) ?? baseElevation;
        const requested = (this.read("zoom") as number) ?? baseDistance;

        const distance = clamp(
            requested,
            camera.minZoom ?? 0.1,
            camera.maxZoom ?? Number.POSITIVE_INFINITY,
        );

        const orbitRad = orbit * (Math.PI / 180);
        const elevationRad = elevation * (Math.PI / 180);
        const horizontal = Math.cos(elevationRad) * distance;

        g.perspective({
            fov: 45,
            near: 0.1,
            far: 1000,
            position: [
                Math.cos(orbitRad) * horizontal,
                Math.sin(elevationRad) * distance,
                Math.sin(orbitRad) * horizontal,
            ],
            lookAt: 0,
        });
    }

    /**
     * One `z = f(x, y)` surface.
     *
     * Keyed by formula id rather than position in the op list. That matters here:
     * hiding a formula removes its op, which would otherwise renumber every later
     * formula's structural path and force the renderer to rebuild all of their
     * geometry. With a stable key each surface keeps its own cached mesh.
     */
    private addSurface(
        g: Graphics3D,
        formula: Formula,
        domain: number,
        segments: number,
        maxHeight: number,
    ): void {
        if (formula.visible === false) return;

        const compiled = compileExpressionCached(formula.expression);
        if (!compiled) return;   // unparseable — skip this surface, keep the rest

        const span = domain * 2;
        const opacity = formula.opacity ?? 0.9;

        g.mesh(
            Geo.parametric({
                segments,
                // The reference's axis convention: the maths plane is (x, y) and the
                // result is height, so maths y becomes three's z and the result
                // becomes three's y.
                vertex: (u, v) => {
                    const x = u * span - domain;
                    const z = v * span - domain;
                    return { x, y: sanitize(compiled(x, z), maxHeight), z };
                },
                computeNormals: true,   // without this the surface is flat-lit
            }),
            Mat.standard({
                color: formula.color,
                side: "double",         // a surface is infinitely thin; show both faces
                roughness: 0.4,
                metalness: 0.1,
                transparent: opacity < 1,
                opacity,
            }),
            { key: `formula:${formula.id}` },
        );
    }

    /**
     * The ground grid, as two line ops — the centre cross and everything else —
     * because a line op carries a single colour and `GridHelper` draws its centre
     * lines differently from the rest.
     */
    private addGrid(g: Graphics3D, grid: GridControls): void {
        const size = grid.size ?? 20;
        const divisions = grid.divisions ?? 20;
        const half = size / 2;
        const step = size / divisions;

        const centre: Vector3Input[] = [];
        const lines: Vector3Input[] = [];

        for (let i = 0; i <= divisions; i++) {
            const offset = -half + i * step;
            // A line is a centre line when it passes through the origin. With an odd
            // division count no line does, which matches GridHelper.
            const isCentre = Math.abs(offset) < step / 1000;
            const target = isCentre ? centre : lines;
            target.push([-half, 0, offset], [half, 0, offset]);   // along X
            target.push([offset, 0, -half], [offset, 0, half]);   // along Z
        }

        if (lines.length > 0) {
            g.line({
                points: lines,
                mode: "segments",
                color: toColor(grid.colorGrid, "#222222"),
                key: "grid:lines",
            });
        }
        if (centre.length > 0) {
            g.line({
                points: centre,
                mode: "segments",
                color: toColor(grid.colorCenterLine, "#444444"),
                key: "grid:centre",
            });
        }
    }

    /** X/Y/Z axes in red/green/blue, matching three's `AxesHelper`. */
    private addAxes(g: Graphics3D, length: number): void {
        const axes: Array<[Vector3Input, string, string]> = [
            [[length, 0, 0], "#ff0000", "x"],
            [[0, length, 0], "#00ff00", "y"],
            [[0, 0, length], "#0000ff", "z"],
        ];

        for (const [end, color, name] of axes) {
            g.line({ points: [[0, 0, 0], end], color, key: `axis:${name}` });
        }
    }
}

/**
 * Make a sampled height safe to put in a vertex buffer.
 *
 * `NaN` (from `sqrt` of a negative, `log` of zero) poisons a whole triangle and
 * leaves a hole; an asymptote produces values large enough to stretch the mesh
 * off-screen and ruin the framing. Both are flattened rather than dropped, so the
 * surface stays continuous.
 */
function sanitize(value: number, maxHeight: number): number {
    if (!Number.isFinite(value)) return 0;
    return clamp(value, -maxHeight, maxHeight);
}

function clamp(value: number, min: number, max: number): number {
    return value < min ? min : value > max ? max : value;
}

/** `GridControls` colours accept a number (three's convention) or a CSS string. */
function toColor(value: string | number | undefined, fallback: string): string {
    if (value === undefined) return fallback;
    if (typeof value === "number") return `#${value.toString(16).padStart(6, "0")}`;
    return value;
}
