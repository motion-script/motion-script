import {
    Fills, Graphics3D, Scene3D, Canvas3D, Tex, property,
    type Color, type NodeConfig, type SurfaceSource3D, type Canvas3DProps,
} from "motion-script";
import { lerpColor, orbitOf, resolveColor, snapFlag } from "./attributes";

/** One screen in the rig: a 2D source plus the buffer it rasterizes into. */
export interface MonitorScreen {
    /** Stable identity for the texture cache — see {@link Tex.surface}. */
    key: string;
    /** A built `Graphics2D`, or a `Node2D` subtree. */
    source: SurfaceSource3D;
    /** Buffer resolution. Also sets the panel's aspect, so nothing stretches. */
    width: number;
    height: number;
}

export interface MonitorWallProps extends Canvas3DProps {
    /** The screens to build the rig around, left to right. */
    screens: MonitorScreen[];
    /**
     * Camera yaw in **degrees**, measured from head-on: 0 faces the screens
     * square, positive swings to the right. Animate to sweep the rig.
     */
    orbit: number;
    /** Camera elevation above the origin, in **degrees**. */
    elevation: number;
    /** Camera distance from the origin. */
    zoom: number;
    /** Vertical field of view, in **degrees**. */
    fov: number;
    /** Height of the point the camera aims at. */
    focus: number;
    /** Distance between adjacent monitor centres, in world units. */
    spacing: number;
    /** How far the outermost monitors turn inward, in **degrees**. */
    toe: number;
    /** Panel width in world units. Panel *height* follows each surface's aspect. */
    panelWidth: number;
    /** Bezel thickness around the panel. */
    bezel: number;
    /** How high the panel centres sit above the origin. */
    lift: number;
    /** Draw a ground plane under the rig. */
    floor: boolean;
    /** Depth fog, in the {@link background} colour. */
    fog: boolean;
    background: Color;
    bezelColor: Color;
    standColor: Color;
    floorColor: Color;
    /** Colour of the fill light in front of the screens. */
    glow: Color;
}

/** The `Monitors` scene's original framing, kept in spherical terms. */
const DEFAULT_VIEW = orbitOf({ x: 13, y: 2.4, z: 0 });

/** Stand proportions, relative to the bottom edge of the bezel. */
const STALK = { width: 0.24, height: 0.9, depth: 0.24 };
const FOOT = { width: 1.6, height: 0.1, depth: 0.7 };

/**
 * A rig of monitors, each showing one {@link MonitorScreen} — 2D content
 * rasterized offscreen and bound to a 3D material with `Tex.surface`.
 *
 * The node owns the *rig*: camera, lighting, floor, fog, and one bezel/stalk/foot
 * assembly per screen, spaced along x and toed inward. The scene owns the
 * *content*: whatever it hands over as a source. So adding a third monitor is
 * adding a third entry.
 *
 *   <MonitorWall width={1760} height={960} orbit={-18} screens={[
 *       { key: 'scope', source: scopeGraphics, width: 1024, height: 640 },
 *       { key: 'stats', source: statsSubtree,  width: 1024, height: 640 },
 *   ]} />
 *   yield* wall().to({ orbit: 16 }, 4, easeInOut('quad'));
 *
 * A source is a plain value — a built `Graphics2D`, or a `Node2D` subtree for
 * anything wanting real layout, shaped `Text` or a loaded `Image`. It does not
 * have to live anywhere in the scene tree: `Canvas3D` binds a node source to its
 * own asset catalog, context and clock. Panel height follows each buffer's
 * aspect, so a screen authored at a different resolution gets a correctly
 * proportioned panel instead of a stretched texture.
 *
 * Every knob is a `@property`: colours declare a `mapper` (CSS string → RGBA
 * tuple) and a `tween` (per-channel lerp), and the two flags declare `snapFlag`
 * so `to()` drives them at all — `to()` only animates keys that are numeric or
 * carry a tween function, so a bare boolean prop would silently never change.
 */
export class MonitorWall extends Canvas3D<MonitorWallProps> {

    /**
     * The screens, left to right. Hoist each `source` rather than rebuilding it
     * per frame — see {@link Tex.surface}.
     */
    @property({ default: [] }) declare screens: MonitorScreen[];

    @property({ default: 0 }) declare orbit: number;
    @property({ default: DEFAULT_VIEW.elevation }) declare elevation: number;
    @property({ default: DEFAULT_VIEW.distance }) declare zoom: number;
    @property({ default: 42 }) declare fov: number;
    @property({ default: 0.2 }) declare focus: number;

    @property({ default: 6.2 }) declare spacing: number;
    @property({ default: 22 }) declare toe: number;
    @property({ default: 4 }) declare panelWidth: number;
    @property({ default: 0.12 }) declare bezel: number;
    @property({ default: 0.35 }) declare lift: number;

    @property({ default: true, tween: snapFlag }) declare floor: boolean;
    @property({ default: true, tween: snapFlag }) declare fog: boolean;

    @property({ default: "#080a10", mapper: resolveColor, tween: lerpColor })
    declare background: Color;
    @property({ default: "#15181f", mapper: resolveColor, tween: lerpColor })
    declare bezelColor: Color;
    @property({ default: "#0f1218", mapper: resolveColor, tween: lerpColor })
    declare standColor: Color;
    @property({ default: "#11141c", mapper: resolveColor, tween: lerpColor })
    declare floorColor: Color;
    @property({ default: "#5f7fd0", mapper: resolveColor, tween: lerpColor })
    declare glow: Color;

    constructor(props?: NodeConfig<MonitorWall, MonitorWallProps>) {
        super(props as NodeConfig<Canvas3D<MonitorWallProps>, MonitorWallProps>);
        // The backdrop is the viewport's own 2D fill — a `Canvas3D` composites
        // its 3D pass over its fill layers, and there is no 3D background pass to
        // reach for. Bound rather than copied so a tweened `background` carries.
        if (props?.fill === undefined) this.applyProp("fill", () => Fills.color(this.background));
    }

    protected override buildScene3D(): Scene3D {
        const scene = new Scene3D();
        const g3 = new Graphics3D();
        const background = this.background;

        // Polar placement is a first-class camera form now, so the local
        // `orbitPosition` helper is gone: `orbit` here means the same thing it
        // means on a `Camera3D`, measured from head-on and around `target`.
        scene.perspective({
            fov: this.fov,
            target: [0, this.focus, 0],
            orbit: this.orbit,
            elevation: this.elevation,
            distance: this.zoom,
        })
            .light({ type: "ambient", intensity: 0.5 })
            .light({ type: "directional", intensity: 1.8 }, { position: [5, 8, 6] })
            // One intensity scale: this used to be 40 beside the directional
            // light's 1.8, because three measures the two in different units.
            .light({ type: "point", intensity: 3.2, color: this.glow }, { position: [0, 1, 5] });

        // Fog in the backdrop's colour, so the rig fades into it rather than into
        // a seam. The backdrop itself is this node's own 2D `fill` — a `Canvas3D`
        // composites the 3D over its fill layers — so it is set there and read
        // back here. Cleared explicitly when off: the recorder holds the last
        // value written, and it is rebuilt from scratch each frame anyway.
        scene.fog(this.fog ? { color: background, near: 15, far: 36 } : null);

        if (this.floor) {
            // No `key`: the floor is emitted conditionally, which used to shift
            // every later op's cache slot, and the reconciler now keys a drawable
            // by its content rather than by its position in the list.
            g3.plane({
                width: 60, height: 60,
                rotation: [-90, 0, 0], position: [0, -2.1, 0],
                fill: this.floorColor, roughness: 0.85,
            });
        }

        // The floor and the camera/lights above belong to the scene root, so draw
        // what has accumulated so far before opening any monitor scope.
        scene.draw(g3);

        const screens = this.screens ?? [];
        const half = ((screens.length - 1) / 2) * this.spacing;
        screens.forEach((screen, index) => {
            const offset = index * this.spacing - half;
            // Turn each monitor inward in proportion to how far out it sits, so the
            // outermost pair lands exactly on ±toe and a centre screen stays square.
            const yaw = half > 0 ? -this.toe * (offset / half) : 0;
            this.addMonitor(scene, screen, offset, yaw);
        });

        return scene;
    }

    /**
     * One monitor: bezel box, screen quad just proud of its face, stalk and foot.
     *
     * Scoped with `begin`/`end` — the same primitive a `Node3D` opens when it
     * records itself — and keyed by the screen's own `key` rather than its slot, so
     * adding or removing a screen leaves the others' cached GPU objects alone.
     */
    private addMonitor(scene: Scene3D, screen: MonitorScreen, x: number, yaw: number): void {
        const g3 = new Graphics3D();
        const width = this.panelWidth;
        // The panel takes the buffer's own aspect, so a screen authored at any
        // resolution shows its texture unstretched.
        const height = width * (screen.height / screen.width);
        const bezel = this.bezel;
        const bottom = -(height / 2 + bezel);

        scene.begin({
            id: `monitor:${screen.key}`,
            transform: { position: [x, this.lift, 0], rotation: [0, yaw, 0] },
        });

        g3.box({
                width: width + bezel * 2, height: height + bezel * 2, depth: 0.18,
                fill: this.bezelColor, roughness: 0.55, metalness: 0.2,
            })
            // `unlit` so the screen reads as its own light source; a lit material
            // would tint the texture with the scene's lighting and read muddy.
            .plane({
                width, height,
                position: [0, 0, 0.095],
                unlit: true,
                fill: Tex.surface(screen.source, { width: screen.width, height: screen.height }),
            })
            .box({
                ...STALK,
                position: [0, bottom - STALK.height / 2, 0],
                fill: this.standColor, roughness: 0.6,
            })
            .box({
                ...FOOT,
                position: [0, bottom - STALK.height - FOOT.height / 2, 0],
                fill: this.standColor, roughness: 0.6,
            });

        scene.draw(g3).end();
    }
}
