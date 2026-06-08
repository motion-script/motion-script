import { ShapeState } from "./shape";

export type PathCommand =
    | { type: "M"; x: number; y: number }
    | { type: "m"; x: number; y: number }
    | { type: "L"; x: number; y: number }
    | { type: "l"; x: number; y: number }
    | { type: "H"; x: number }
    | { type: "h"; x: number }
    | { type: "V"; y: number }
    | { type: "v"; y: number }
    | { type: "C"; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
    | { type: "c"; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
    | { type: "S"; x2: number; y2: number; x: number; y: number }
    | { type: "s"; x2: number; y2: number; x: number; y: number }
    | { type: "Q"; x1: number; y1: number; x: number; y: number }
    | { type: "q"; x1: number; y1: number; x: number; y: number }
    | { type: "T"; x: number; y: number }
    | { type: "t"; x: number; y: number }
    | { type: "A"; rx: number; ry: number; rotation: number; largeArc: 0 | 1; sweep: 0 | 1; x: number; y: number }
    | { type: "a"; rx: number; ry: number; rotation: number; largeArc: 0 | 1; sweep: 0 | 1; x: number; y: number }
    | { type: "Z" | "z" };



export type PathData = string | PathCommand[];

export function toPathString(d: PathData): string {
    if (typeof d === "string") return d;
    return d.map(cmd => {
        switch (cmd.type) {
            case "M": case "m": return `${cmd.type} ${cmd.x} ${cmd.y}`;
            case "L": case "l": return `${cmd.type} ${cmd.x} ${cmd.y}`;
            case "T": case "t": return `${cmd.type} ${cmd.x} ${cmd.y}`;
            case "H": case "h": return `${cmd.type} ${cmd.x}`;
            case "V": case "v": return `${cmd.type} ${cmd.y}`;
            case "C": case "c": return `${cmd.type} ${cmd.x1} ${cmd.y1} ${cmd.x2} ${cmd.y2} ${cmd.x} ${cmd.y}`;
            case "S": case "s": return `${cmd.type} ${cmd.x2} ${cmd.y2} ${cmd.x} ${cmd.y}`;
            case "Q": case "q": return `${cmd.type} ${cmd.x1} ${cmd.y1} ${cmd.x} ${cmd.y}`;
            case "A": case "a": return `${cmd.type} ${cmd.rx} ${cmd.ry} ${cmd.rotation} ${cmd.largeArc} ${cmd.sweep} ${cmd.x} ${cmd.y}`;
            case "Z": case "z": return cmd.type;
        }
    }).join(" ");
}

/** An axis-aligned bounding box in path coordinates: [minX, minY, maxX, maxY]. */
export type PathBounds = readonly [number, number, number, number];

export interface PathState extends ShapeState {
    d: PathData;
    /**
     * Explicit frame to center the path against, as [minX, minY, maxX, maxY] in
     * the path's own coordinate space. When set, the path is shifted so this
     * box's center lands on the local origin — instead of the path centering on
     * its *own* bbox.
     *
     * Use this when several paths share one layout frame (e.g. per-glyph LaTeX
     * tokens). Passing the same whole-shape bounds to every path keeps their
     * relative positions intact, where per-path self-centering would collapse
     * them onto a single point. When unset, the path centers on its own bbox.
     */
    centerBounds?: PathBounds;
}

export function withPathDescriptor(descriptor: Partial<PathState>): PathState {
    return {
        opacity: descriptor.opacity ?? 1,

        rotation: descriptor.rotation ?? 0,
        scale: descriptor.scale ?? 1,
        x: descriptor.x ?? 0,
        y: descriptor.y ?? 0,
        start: descriptor.start ?? 0,
        end: descriptor.end ?? 1,
        effects: descriptor.effects ?? [],
        width: descriptor.width ?? 0,
        height: descriptor.height ?? 0,
        pivot: descriptor.pivot ?? { x: 0, y: 0 },

        d: descriptor.d ?? "",
        centerBounds: descriptor.centerBounds,
    };
}
