import {
    Fills, Geo, Graphics3D, Scene3D, Mat, lerpNumber, property, Canvas3D,
    type Color, type NodeConfig, type NormalizedColor, type Canvas3DProps, type Vector3Input,
} from "motion-script";
import {
    lerpColor, lerpCount, lerpFinite, orbitOf, resolveColor, sanitizeHeight,
    snapFlag,
} from "./attributes";
import { compileExpressionCached, type CompiledExpression } from "./expression";

// ── Authored props ───────────────────────────────────────────────────────────
// The loose shapes an author writes. Each has a matching `*Resolved` type below:
// what the `@property` mapper turns it into and what the tween interpolates.

/** One plotted surface, `z = f(x, y)`. */
export interface Formula {
    /** Identity across formula-list changes — see {@link Graph3D.formulas}. */
    id: string | number;
    /**
     * The mathematical expression string (e.g., 'sin(x) + cos(y)').
     * Evaluated as z = f(x, y).
     */
    expression: string;
    /** Colour of the rendered mesh. Any {@link Color} — CSS string or RGBA tuple. */
    color: Color;
    /** Whether the formula is currently visible on the graph. Defaults to true. */
    visible?: boolean;
    /**
     * Opacity of the rendered mesh (0.0 to 1.0). Defaults to 1.
     *
     * Anything below 1 makes the surface blend rather than write depth, so
     * overlapping surfaces layer instead of occluding each other. Left at 1 the
     * surface is genuinely opaque and reads crisp — which is why it is the
     * default, and why fading one in or out looks right on the way through.
     */
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
 * effect here. What *is* honoured: {@link initialPosition} seeds the camera, and
 * {@link minZoom}/{@link maxZoom} clamp its distance from the target. To move the
 * camera, animate {@link Graph3D.orbit} / {@link Graph3D.elevation} /
 * {@link Graph3D.zoom} from the timeline — that stays seekable.
 */
export interface CameraControls {
    /** Initial X, Y, Z position of the camera. */
    initialPosition?: { x: number; y: number; z: number };
    /** Minimum allowed zoom distance (OrbitControls minDistance). */
    minZoom?: number;
    /** Maximum allowed zoom distance (OrbitControls maxDistance). */
    maxZoom?: number;
    /** Enable or disable user rotation (orbiting). Inert — see above. */
    enableRotate?: boolean;
    /** Enable or disable user panning. Inert — see above. */
    enablePan?: boolean;
    /** Enable or disable user zooming. Inert — see above. */
    enableZoom?: boolean;
    /** Enable smooth damping for camera movements. Inert — see above. */
    enableDamping?: boolean;
    /** Damping factor (inertia) if enableDamping is true. Inert — see above. */
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
    /** Colour of the center lines (axes). A {@link Color}, or three's `0xRRGGBB`. */
    colorCenterLine?: Color | number;
    /** Colour of the grid lines. A {@link Color}, or three's `0xRRGGBB`. */
    colorGrid?: Color | number;
    /** Whether to display the primary X, Y, Z axes helper. Defaults to true. */
    showAxes?: boolean;
    /** Length of the axes helper lines. Defaults to 10. */
    axesSize?: number;
}

export interface Graph3DProps extends Canvas3DProps {
    /** Surfaces to plot. Each is evaluated as `z = f(x, y)` over the domain. */
    formulas: Formula[];
    camera: CameraControls;
    grid: GridControls;
    /** Half-width of the plotted domain: x and y run `-domain … +domain`. Default 10. */
    domain: number;
    /**
     * Surface resolution per axis. Default 100, i.e. ~10k vertices per formula.
     * Lower it when plotting many formulas at once.
     */
    segments: number;
    /**
     * Clamp `|z|` to this. Default 20. Without it a function with an asymptote
     * (`1/x`, `tan`) produces near-infinite vertices that stretch the mesh across
     * the whole scene and wreck the camera framing.
     */
    maxHeight: number;
    /** Camera orbit angle about the Y axis, in **degrees**. Animate to spin. */
    orbit: number;
    /**
     * Camera elevation above the ground plane, in **degrees**. 0 is edge-on, 90 is
     * straight down. Defaults to whatever `camera.initialPosition` implies.
     */
    elevation: number;
    /** Camera distance from the origin. Clamped by `camera.minZoom`/`maxZoom`. */
    zoom: number;
    /** Scene background. Default `#111827`, matching the reference. */
    background: Color;
}

// ── Resolved props ───────────────────────────────────────────────────────────
// Canonical, fully-defaulted, interpolatable. Nothing here is optional, so the
// builder never re-derives a default and the tweens never test for one.

/** {@link Formula} after {@link resolveFormulas}. */
interface FormulaResolved {
    id: string | number;
    /** The compiled expression. Compiled once at *write* time, not per vertex. */
    sample: CompiledExpression;
    color: NormalizedColor;
    /** `visible: false` is folded in here as 0, so hiding can fade. */
    opacity: number;
}

/** {@link CameraControls} after {@link resolveCamera}. */
interface CameraResolved extends CameraControls {
    initialPosition: { x: number; y: number; z: number };
    minZoom: number;
    maxZoom: number;
}

/** {@link GridControls} after {@link resolveGrid}. */
interface GridResolved {
    showGrid: boolean;
    size: number;
    divisions: number;
    colorCenterLine: NormalizedColor;
    colorGrid: NormalizedColor;
    showAxes: boolean;
    axesSize: number;
}

const DEFAULT_POSITION = { x: 15, y: 12, z: 18 };

/**
 * A 3D function grapher — plots any number of `z = f(x, y)` surfaces with a
 * helper grid and axes.
 *
 * Extends {@link Canvas3D} (which is itself a `Node2D`) rather than `Node2D` directly:
 * `Canvas3D` owns the bridge from the 2D scene graph into the 3D renderer, so
 * subclassing it means this node only has to describe *what* to draw. It
 * overrides `canvas3D`, the same single seam the real render and the asset-tracking
 * replay both go through.
 *
 *   <Graph3D
 *       width="fill" height="fill"
 *       formulas={[{ id: 1, expression: 'sin(sqrt(x^2 + y^2))', color: '#3B82F6' }]}
 *   />
 *   yield* graphRef().to({ orbit: 380, zoom: 38 }, 4, easeInOut('quad'));
 *
 * Every prop is a `@property`, so all three authoring styles work and agree:
 * a constant, a `() => signal()` binding, or `set()`/`to()` on a ref. The
 * non-scalar props each declare a `mapper` (loose authored shape → one canonical
 * internal shape) and a `tween` (how that shape interpolates) — without the
 * tween, `to({ grid: … })` would hold the old value and snap at the end, which is
 * the standard trap for an object-valued attribute.
 */
export class Graph3D extends Canvas3D<Graph3DProps> {

    /**
     * The plotted surfaces.
     *
     * The mapper compiles each expression **once per write** (memoised by source),
     * so the builder — which re-runs every frame — never re-parses; and it folds
     * `visible`/`opacity` into a single number so hiding is expressible as a fade.
     *
     * The tween matches the two lists **by `id`**: a surface present in both
     * morphs (its sampled height blends between the old and new expression, its
     * colour and opacity lerp), one only in the old list fades out, one only in
     * the new list fades in. That is also why `id` matters at draw time — each
     * surface is keyed by it, so adding or dropping one leaves the others' cached
     * GPU geometry alone instead of renumbering every later op's structural path.
     */
    @property({ default: [], mapper: resolveFormulas, tween: lerpFormulas })
    declare formulas: Formula[];

    /** Camera limits and the framing that seeds `orbit`/`elevation`/`zoom`. */
    @property({ default: {}, mapper: resolveCamera, tween: lerpCamera })
    declare camera: CameraControls;

    /** The helper grid and axes. Flags snap at the end of a tween; the rest lerp. */
    @property({ default: {}, mapper: resolveGrid, tween: lerpGrid })
    declare grid: GridControls;

    @property({ default: 10 }) declare domain: number;
    /**
     * Surface resolution. Tweenable, but *structural*: a three geometry is
     * immutable, so every intermediate value reallocates each surface's buffers.
     * Set it once unless the resolution change is the point.
     */
    @property({ default: 100 }) declare segments: number;
    @property({ default: 20 }) declare maxHeight: number;

    @property({ default: "#111827", mapper: resolveColor, tween: lerpColor })
    declare background: Color;

    // No `default:` — the baseline is derived from `camera.initialPosition` in
    // applyCameraDefaults() below, which can't be expressed as a static default.
    @property() declare orbit: number;
    @property() declare elevation: number;
    @property() declare zoom: number;

    constructor(props?: NodeConfig<Graph3D, Graph3DProps>) {
        super(props as NodeConfig<Canvas3D<Graph3DProps>, Graph3DProps>);
        this.applyCameraDefaults(props);
        // The backdrop is the viewport's own 2D fill — a `Canvas3D` composites
        // its 3D pass over its fill layers, and there is no 3D background pass to
        // reach for. Bound rather than copied so a tweened `background` carries.
        if (props?.fill === undefined) this.applyProp("fill", () => Fills.color(this.background));
    }

    /**
     * Seed `orbit`/`elevation`/`zoom` from `camera.initialPosition`, so an author
     * who gives a raw position gets that framing and one who gives none gets
     * {@link DEFAULT_POSITION} — without having to restate the other two axes.
     *
     * Bound reactively rather than copied: the default *tracks* `camera`, so a
     * camera signal keeps working. Writing any of the three (a `set`, or the first
     * frame of a `to`) replaces the binding with the explicit value, which is
     * exactly the handover we want.
     */
    private applyCameraDefaults(props?: NodeConfig<Graph3D, Graph3DProps>): void {
        const seed = (): ReturnType<typeof orbitOf> =>
            orbitOf((this.camera as CameraResolved).initialPosition);

        if (props?.orbit === undefined) this.applyProp("orbit", () => seed().orbit);
        if (props?.elevation === undefined) this.applyProp("elevation", () => seed().elevation);
        if (props?.zoom === undefined) this.applyProp("zoom", () => seed().distance);
    }

    // ---- Drawing ----------------------------------------------------------

    protected override buildScene3D(): Scene3D {
        const scene = new Scene3D();
        const g3 = new Graphics3D();
        const camera = this.camera as CameraResolved;
        const grid = this.grid as unknown as GridResolved;
        const formulas = this.formulas as unknown as FormulaResolved[];

        // Polar placement is the camera's own vocabulary now, so this node's
        // orbit/elevation/zoom pass straight through instead of being converted
        // by a local helper. `near`/`far` are derived from the scene's own
        // bounds; the backdrop is the viewport's own 2D fill.
        scene.perspective({
            fov: 45,
            orbit: this.orbit,
            elevation: this.elevation,
            // Clamped here rather than in the mapper: `zoom` and the limits are
            // separate props, so either can be tweened and the clamp still holds.
            distance: Math.min(Math.max(this.zoom, camera.minZoom), camera.maxZoom),
        });

        // Lighting mirrors the reference: a soft ambient fill plus a key light and
        // a weaker back light, so the underside of a surface stays readable when
        // the camera orbits beneath it.
        scene.light({ type: "ambient", intensity: 0.4 })
            .light({ type: "directional", intensity: 0.6 }, { position: [10, 20, 10] })
            .light({ type: "directional", intensity: 0.4 }, { position: [-10, -20, -10] });

        if (grid.showGrid) this.addGrid(g3, grid);
        if (grid.showAxes) this.addAxes(g3, grid.axesSize);

        const domain = this.domain;
        const segments = Math.max(1, Math.round(this.segments));
        const maxHeight = this.maxHeight;
        formulas.forEach((formula, index) => {
            this.addSurface(g3, formula, index, domain, segments, maxHeight);
        });

        return scene.draw(g3);
    }

    /**
     * One `z = f(x, y)` surface, keyed by formula id rather than position in the
     * op list — see {@link Graph3D.formulas}.
     */
    private addSurface(
        g3: Graphics3D,
        formula: FormulaResolved,
        index: number,
        domain: number,
        segments: number,
        maxHeight: number,
    ): void {
        // Fully faded out (hidden, or the far end of a cross-fade): emit nothing.
        // Safe to skip precisely because identity is the `key`, not the slot.
        if (formula.opacity <= 0.001) return;

        const span = domain * 2;
        const { sample, opacity } = formula;
        const solid = opacity >= 1;

        g3.mesh(
            Geo.parametric({
                segments,
                // The reference's axis convention: the maths plane is (x, y) and the
                // result is height, so maths y becomes three's z and the result
                // becomes three's y.
                vertex: (u, v) => {
                    const x = u * span - domain;
                    const z = v * span - domain;
                    return { x, y: sanitizeHeight(sample(x, z), maxHeight), z };
                },
                computeNormals: true,   // without this the surface is flat-lit
            }),
            Mat.standard({
                color: formula.color,
                faces: "both",          // a surface is infinitely thin; show both faces
                roughness: 0.4,
                metalness: 0.1,
                // No `transparent` here: the renderer derives blending from the
                // opacity, which is the whole reason the flag went away. Depth is
                // still a decision, and it is the one below.
                opacity,
                // The fix for surfaces tearing holes in each other mid-fade. A
                // translucent mesh that still writes depth occludes everything
                // drawn after it, so a surface at 5% opacity renders as a
                // near-invisible cut-out through the surfaces behind it — and it
                // resolves only once the fade lands. Depth is written by fully
                // opaque surfaces only; the rest blend, which is what asking for
                // an opacity below 1 means.
                depthWrite: solid,
            }),
            {
                // No key: a surface appearing or disappearing used to renumber
                // every one after it, and the reconciler now keys a drawable by
                // its content rather than by its slot in the list.
                //
                // Three sorts the transparent pass back-to-front by centroid
                // distance — and every surface here is centred on the origin, so
                // their sort keys are identical and the order is arbitrary, which
                // flickers as the camera orbits. An explicit order makes it stable.
                renderOrder: index,
            },
        );
    }

    /**
     * The ground grid, as two line ops — the centre cross and everything else —
     * because a line op carries a single colour and `GridHelper` draws its centre
     * lines differently from the rest.
     */
    private addGrid(g3: Graphics3D, grid: GridResolved): void {
        const divisions = Math.max(1, grid.divisions);
        const half = grid.size / 2;
        const step = grid.size / divisions;

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
            g3.line({ points: lines, segments: true, stroke: { fill: grid.colorGrid } });
        }
        if (centre.length > 0) {
            g3.line({ points: centre, segments: true, stroke: { fill: grid.colorCenterLine } });
        }
    }

    /** X/Y/Z axes in red/green/blue, matching three's `AxesHelper`. */
    private addAxes(g3: Graphics3D, length: number): void {
        const axes: Array<[Vector3Input, string, string]> = [
            [[length, 0, 0], "#ff0000", "x"],
            [[0, length, 0], "#00ff00", "y"],
            [[0, 0, length], "#0000ff", "z"],
        ];

        for (const [end, color, name] of axes) {
            g3.line({ points: [[0, 0, 0], end], stroke: { fill: color } });
        }
    }
}

// ── Mappers & tweens ─────────────────────────────────────────────────────────

/** Mapper for {@link Graph3D.formulas}. */
function resolveFormulas(input: Formula[] | undefined): FormulaResolved[] {
    if (!input) return [];
    const out: FormulaResolved[] = [];
    for (const formula of input) {
        const sample = compileExpressionCached(formula.expression);
        if (!sample) continue;   // unparseable — drop this surface, keep the rest
        out.push({
            id: formula.id,
            sample,
            color: resolveColor(formula.color),
            opacity: formula.visible === false ? 0 : formula.opacity ?? 1,
        });
    }
    return out;
}

/** Tween for {@link Graph3D.formulas}: match by id, morph / fade in / fade out. */
function lerpFormulas(from: FormulaResolved[], to: FormulaResolved[], t: number): FormulaResolved[] {
    if (t <= 0) return from;
    if (t >= 1) return to;

    const arriving = new Map(to.map((formula) => [formula.id, formula]));
    const out: FormulaResolved[] = from.map((a) => {
        const b = arriving.get(a.id);
        // Not in the target list: fade it out in place, still sampling its own
        // expression, so it sinks away as itself rather than snapping off.
        return b ? blendFormula(a, b, t) : { ...a, opacity: a.opacity * (1 - t) };
    });

    const held = new Set(from.map((formula) => formula.id));
    for (const b of to) {
        if (!held.has(b.id)) out.push({ ...b, opacity: b.opacity * t });
    }
    return out;
}

/** Interpolate one surface that exists on both sides of the tween. */
function blendFormula(a: FormulaResolved, b: FormulaResolved, t: number): FormulaResolved {
    return {
        id: b.id,
        // Same id, different expression → morph the *geometry*: sample both and
        // blend the heights, so the surface deforms into the new function rather
        // than popping. The double evaluation is only paid mid-tween, and the
        // identity check skips it entirely when the expression didn't change
        // (compileExpressionCached memoises by source, so equal source is ===).
        sample: a.sample === b.sample
            ? b.sample
            : (x, y) => {
                const start = a.sample(x, y);
                return start + (b.sample(x, y) - start) * t;
            },
        color: lerpColor(a.color, b.color, t),
        opacity: lerpNumber(a.opacity, b.opacity, t),
    };
}

/** Mapper for {@link Graph3D.camera}. Inert OrbitControls flags pass through. */
function resolveCamera(input: CameraControls | undefined): CameraResolved {
    return {
        ...input,
        initialPosition: input?.initialPosition ?? DEFAULT_POSITION,
        minZoom: input?.minZoom ?? 0.1,
        maxZoom: input?.maxZoom ?? Number.POSITIVE_INFINITY,
    };
}

/** Tween for {@link Graph3D.camera}. */
function lerpCamera(from: CameraResolved, to: CameraResolved, t: number): CameraResolved {
    return {
        ...to,
        initialPosition: {
            x: lerpNumber(from.initialPosition.x, to.initialPosition.x, t),
            y: lerpNumber(from.initialPosition.y, to.initialPosition.y, t),
            z: lerpNumber(from.initialPosition.z, to.initialPosition.z, t),
        },
        // `maxZoom` defaults to Infinity, which a plain lerp turns into NaN.
        minZoom: lerpFinite(from.minZoom, to.minZoom, t),
        maxZoom: lerpFinite(from.maxZoom, to.maxZoom, t),
    };
}

/** Mapper for {@link Graph3D.grid}. */
function resolveGrid(input: GridControls | undefined): GridResolved {
    return {
        showGrid: input?.showGrid !== false,
        size: input?.size ?? 20,
        divisions: input?.divisions ?? 20,
        colorCenterLine: resolveColor(toColor(input?.colorCenterLine, "#444444")),
        colorGrid: resolveColor(toColor(input?.colorGrid, "#222222")),
        showAxes: input?.showAxes !== false,
        axesSize: input?.axesSize ?? 10,
    };
}

/** Tween for {@link Graph3D.grid}. */
function lerpGrid(from: GridResolved, to: GridResolved, t: number): GridResolved {
    return {
        showGrid: snapFlag(from.showGrid, to.showGrid, t),
        size: lerpNumber(from.size, to.size, t),
        divisions: lerpCount(from.divisions, to.divisions, t),
        colorCenterLine: lerpColor(from.colorCenterLine, to.colorCenterLine, t),
        colorGrid: lerpColor(from.colorGrid, to.colorGrid, t),
        showAxes: snapFlag(from.showAxes, to.showAxes, t),
        axesSize: lerpNumber(from.axesSize, to.axesSize, t),
    };
}

/** `GridControls` colours also accept a number, three's `0xRRGGBB` convention. */
function toColor(value: Color | number | undefined, fallback: Color): Color {
    if (value === undefined) return fallback;
    if (typeof value === "number") return `#${value.toString(16).padStart(6, "0")}`;
    return value;
}
