/**
 * `Geometry3D` descriptor → `THREE.BufferGeometry`.
 *
 * three geometries are immutable: their vertex buffers are built by the
 * constructor and there is no API to change a `BoxGeometry`'s width afterwards.
 * So every parameter here is **structural** — the reconciler compares a signature
 * and rebuilds on any change. That's why the docs push `scale` over animated
 * geometry params.
 *
 * The one exception is `buffer` (and `parametric`, which evaluates into one),
 * whose attribute *contents* can be re-uploaded in place as long as the lengths
 * hold. See {@link updateBufferGeometry}.
 */

import type * as THREE from "three";
import type {
    BufferGeometry3D, Geometry3D, ParametricGeometry3D, Vector3Input,
} from "@motion-script/core";
import { evaluateParametric, resolveVector3, toPathString } from "@motion-script/core";
import type { ThreeModule } from "../bridge";
import { deg } from "./constants";

/** Build a three geometry for `descriptor`. */
export function createGeometry(three: ThreeModule, descriptor: Geometry3D): THREE.BufferGeometry {
    switch (descriptor.type) {
        case "box":
            return new three.BoxGeometry(
                descriptor.width ?? 1, descriptor.height ?? 1, descriptor.depth ?? 1,
                descriptor.widthSegments ?? 1, descriptor.heightSegments ?? 1, descriptor.depthSegments ?? 1,
            );

        case "sphere":
            return new three.SphereGeometry(
                descriptor.radius ?? 1,
                descriptor.widthSegments ?? 32, descriptor.heightSegments ?? 16,
                deg(descriptor.phiStart ?? 0), deg(descriptor.phiLength ?? 360),
                deg(descriptor.thetaStart ?? 0), deg(descriptor.thetaLength ?? 180),
            );

        case "plane":
            return new three.PlaneGeometry(
                descriptor.width ?? 1, descriptor.height ?? 1,
                descriptor.widthSegments ?? 1, descriptor.heightSegments ?? 1,
            );

        case "cylinder":
            return new three.CylinderGeometry(
                descriptor.radiusTop ?? 1, descriptor.radiusBottom ?? 1, descriptor.height ?? 1,
                descriptor.radialSegments ?? 32, descriptor.heightSegments ?? 1,
                descriptor.openEnded ?? false,
                deg(descriptor.thetaStart ?? 0), deg(descriptor.thetaLength ?? 360),
            );

        case "cone":
            return new three.ConeGeometry(
                descriptor.radius ?? 1, descriptor.height ?? 1,
                descriptor.radialSegments ?? 32, descriptor.heightSegments ?? 1,
                descriptor.openEnded ?? false,
                deg(descriptor.thetaStart ?? 0), deg(descriptor.thetaLength ?? 360),
            );

        case "torus":
            return new three.TorusGeometry(
                descriptor.radius ?? 1, descriptor.tube ?? 0.4,
                descriptor.radialSegments ?? 16, descriptor.tubularSegments ?? 48,
                deg(descriptor.arc ?? 360),
            );

        case "torusKnot":
            return new three.TorusKnotGeometry(
                descriptor.radius ?? 1, descriptor.tube ?? 0.4,
                descriptor.tubularSegments ?? 64, descriptor.radialSegments ?? 8,
                descriptor.p ?? 2, descriptor.q ?? 3,
            );

        case "circle":
            return new three.CircleGeometry(
                descriptor.radius ?? 1, descriptor.segments ?? 32,
                deg(descriptor.thetaStart ?? 0), deg(descriptor.thetaLength ?? 360),
            );

        case "ring":
            return new three.RingGeometry(
                descriptor.innerRadius ?? 0.5, descriptor.outerRadius ?? 1,
                descriptor.thetaSegments ?? 32, descriptor.phiSegments ?? 1,
                deg(descriptor.thetaStart ?? 0), deg(descriptor.thetaLength ?? 360),
            );

        case "capsule":
            return new three.CapsuleGeometry(
                descriptor.radius ?? 0.5, descriptor.height ?? 1,
                descriptor.capSegments ?? 8, descriptor.radialSegments ?? 16,
            );

        case "polyhedron":
            return createPolyhedron(three, descriptor.shape, descriptor.radius ?? 1, descriptor.detail ?? 0);

        case "extrude":
            return createExtrude(three, descriptor);

        case "lathe":
            return new three.LatheGeometry(
                descriptor.points.map((p) => toVector2(three, p)),
                descriptor.segments ?? 12,
                deg(descriptor.phiStart ?? 0), deg(descriptor.phiLength ?? 360),
            );

        case "tube":
            return new three.TubeGeometry(
                new three.CatmullRomCurve3(descriptor.points.map((p) => toVector3(three, p)), descriptor.closed ?? false),
                descriptor.tubularSegments ?? 64, descriptor.radius ?? 1,
                descriptor.radialSegments ?? 8, descriptor.closed ?? false,
            );

        case "buffer":
            return createBufferGeometry(three, descriptor);

        case "parametric":
            return createBufferGeometry(three, evaluateParametric(descriptor));

        case "edges": {
            const source = createGeometry(three, descriptor.source);
            const edges = new three.EdgesGeometry(source, descriptor.thresholdAngle ?? 1);
            // The source was a scratch object built only to derive the edges.
            source.dispose();
            return edges;
        }

        case "wireframe": {
            const source = createGeometry(three, descriptor.source);
            const frame = new three.WireframeGeometry(source);
            source.dispose();
            return frame;
        }

        case "modelGeometry":
            // Model loading arrives with its own phase; until then an empty
            // geometry renders nothing rather than throwing mid-frame.
            return new three.BufferGeometry();

        default:
            return new three.BufferGeometry();
    }
}

function createPolyhedron(
    three: ThreeModule,
    shape: "tetrahedron" | "octahedron" | "icosahedron" | "dodecahedron",
    radius: number,
    detail: number,
): THREE.BufferGeometry {
    switch (shape) {
        case "tetrahedron": return new three.TetrahedronGeometry(radius, detail);
        case "octahedron": return new three.OctahedronGeometry(radius, detail);
        case "dodecahedron": return new three.DodecahedronGeometry(radius, detail);
        default: return new three.IcosahedronGeometry(radius, detail);
    }
}

/**
 * Extrude a 2D outline. Reuses core's own path vocabulary: the descriptor takes
 * the same `PathData`/`PathBuilder` a 2D `Path` node does, converted here through
 * three's SVG-path reader so an existing outline becomes a solid unchanged.
 */
function createExtrude(
    three: ThreeModule,
    descriptor: Extract<Geometry3D, { type: "extrude" }>,
): THREE.BufferGeometry {
    const source = descriptor.shape;
    const data = typeof source === "object" && "toPathState" in source
        ? (source as { toPathState(): { data: unknown } }).toPathState().data
        : source;

    const shapes = pathToShapes(three, toPathString(data as never));
    if (shapes.length === 0) return new three.BufferGeometry();

    return new three.ExtrudeGeometry(shapes, {
        depth: descriptor.depth ?? 1,
        curveSegments: descriptor.curveSegments ?? 12,
        bevelEnabled: descriptor.bevel ?? false,
        bevelThickness: descriptor.bevelThickness ?? 0.2,
        bevelSize: descriptor.bevelSize ?? 0.1,
        bevelOffset: descriptor.bevelOffset ?? 0,
        bevelSegments: descriptor.bevelSegments ?? 3,
    });
}

/**
 * Parse an SVG path string into three `Shape`s.
 *
 * three's `SVGLoader.createShapes` lives in addons, which would defeat the lazy
 * boundary for everyone — so this walks the subset of commands core's
 * `PathBuilder` emits (M/L/C/Q/Z, absolute) directly onto a `THREE.Shape`.
 */
function pathToShapes(three: ThreeModule, path: string): THREE.Shape[] {
    const shapes: THREE.Shape[] = [];
    let current: THREE.Shape | null = null;
    let cursorX = 0;
    let cursorY = 0;

    // Split into commands: a letter followed by its numeric arguments.
    const tokens = path.match(/[MLCQZmlcqz][^MLCQZmlcqz]*/g) ?? [];

    for (const token of tokens) {
        const op = token[0];
        const args = (token.slice(1).match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number);

        switch (op) {
            case "M":
            case "m": {
                if (current) shapes.push(current);
                current = new three.Shape();
                cursorX = args[0] ?? 0;
                cursorY = args[1] ?? 0;
                current.moveTo(cursorX, cursorY);
                break;
            }
            case "L":
            case "l": {
                if (!current) break;
                for (let i = 0; i + 1 < args.length; i += 2) {
                    cursorX = args[i]; cursorY = args[i + 1];
                    current.lineTo(cursorX, cursorY);
                }
                break;
            }
            case "C":
            case "c": {
                if (!current) break;
                for (let i = 0; i + 5 < args.length; i += 6) {
                    current.bezierCurveTo(args[i], args[i + 1], args[i + 2], args[i + 3], args[i + 4], args[i + 5]);
                    cursorX = args[i + 4]; cursorY = args[i + 5];
                }
                break;
            }
            case "Q":
            case "q": {
                if (!current) break;
                for (let i = 0; i + 3 < args.length; i += 4) {
                    current.quadraticCurveTo(args[i], args[i + 1], args[i + 2], args[i + 3]);
                    cursorX = args[i + 2]; cursorY = args[i + 3];
                }
                break;
            }
            case "Z":
            case "z": {
                current?.closePath();
                break;
            }
        }
    }

    if (current) shapes.push(current);
    return shapes;
}

/** Build a geometry from raw vertex buffers. */
function createBufferGeometry(three: ThreeModule, descriptor: BufferGeometry3D): THREE.BufferGeometry {
    const geometry = new three.BufferGeometry();

    geometry.setAttribute("position", new three.BufferAttribute(toFloat32(descriptor.position), 3));
    if (descriptor.normal) geometry.setAttribute("normal", new three.BufferAttribute(toFloat32(descriptor.normal), 3));
    if (descriptor.uv) geometry.setAttribute("uv", new three.BufferAttribute(toFloat32(descriptor.uv), 2));
    if (descriptor.color) geometry.setAttribute("color", new three.BufferAttribute(toFloat32(descriptor.color), 3));
    if (descriptor.index) geometry.setIndex(new three.BufferAttribute(toUint32(descriptor.index), 1));

    // Derive normals only when the author didn't supply them — recomputing over
    // authored normals would silently discard them.
    if (descriptor.computeNormals && !descriptor.normal) geometry.computeVertexNormals();

    return geometry;
}

/**
 * Re-upload a buffer geometry's attribute contents in place.
 *
 * The cheap path for an animated mesh: as long as every array length is
 * unchanged, this writes into the existing GPU buffers (a `bufferSubData`) rather
 * than reallocating. Returns `false` when a length changed, which tells the
 * reconciler to rebuild instead.
 */
export function updateBufferGeometry(
    geometry: THREE.BufferGeometry,
    descriptor: BufferGeometry3D,
): boolean {
    if (!writeAttribute(geometry, "position", descriptor.position, 3)) return false;
    if (!writeAttribute(geometry, "normal", descriptor.normal, 3)) return false;
    if (!writeAttribute(geometry, "uv", descriptor.uv, 2)) return false;
    if (!writeAttribute(geometry, "color", descriptor.color, 3)) return false;

    if (descriptor.index) {
        const index = geometry.getIndex();
        if (!index || index.array.length !== descriptor.index.length) return false;
        (index.array as unknown as { set(v: ArrayLike<number>): void }).set(descriptor.index);
        index.needsUpdate = true;
    }

    // Positions moved, so authored-free normals are stale.
    if (descriptor.computeNormals && !descriptor.normal) geometry.computeVertexNormals();

    // The bounding sphere is cached from the old positions; frustum culling would
    // pop the mesh in and out without this.
    geometry.computeBoundingSphere();
    return true;
}

function writeAttribute(
    geometry: THREE.BufferGeometry,
    name: string,
    source: ArrayLike<number> | undefined,
    itemSize: number,
): boolean {
    const existing = geometry.getAttribute(name) as THREE.BufferAttribute | undefined;

    if (!source) return existing === undefined;
    if (!existing) return false;
    if (existing.array.length !== source.length) return false;
    if (existing.itemSize !== itemSize) return false;

    (existing.array as unknown as { set(v: ArrayLike<number>): void }).set(source);
    existing.needsUpdate = true;
    return true;
}

/**
 * A structural signature for a geometry descriptor.
 *
 * Any difference means "rebuild". Built by walking the descriptor's own keys in a
 * stable order rather than `JSON.stringify`, which allocates heavily and would
 * show up at 60 fps. Typed arrays contribute only their length: their *contents*
 * are handled by {@link updateBufferGeometry}'s in-place path, so including them
 * here would force a rebuild on every frame of an animated mesh.
 */
export function geometrySignature(descriptor: Geometry3D): string {
    const parts: string[] = [descriptor.type];
    const bag = descriptor as unknown as Record<string, unknown>;

    for (const key of Object.keys(bag).sort()) {
        if (key === "type") continue;
        const value = bag[key];

        if (value === undefined) continue;

        if (key === "source") {
            // Derived geometry (edges/wireframe): fold in the source's signature.
            parts.push(`source=${geometrySignature(value as Geometry3D)}`);
        } else if (typeof value === "function") {
            // A parametric `vertex`/`color` callback is a fresh closure every
            // build, so its identity carries no information — including it would
            // force a rebuild on every frame. Its *output* is re-evaluated and
            // uploaded in place instead; a change in vertex count still forces a
            // rebuild via `segments`, which is a plain number and is included.
            continue;
        } else if (isArrayLike(value)) {
            parts.push(`${key}#${(value as ArrayLike<number>).length}`);
        } else if (typeof value === "object") {
            parts.push(`${key}=${JSON.stringify(value)}`);
        } else {
            parts.push(`${key}=${String(value)}`);
        }
    }

    return parts.join("|");
}

/**
 * True when a descriptor's attribute contents should be re-uploaded every frame.
 *
 * A `buffer` geometry defaults to dynamic because mutating a reused
 * `Float32Array` in place — the fast way to animate a mesh — is invisible to
 * identity comparison. `staticData: true` opts out; a `revision` bump is the
 * explicit signal.
 */
export function isDynamicGeometry(descriptor: Geometry3D): descriptor is BufferGeometry3D | ParametricGeometry3D {
    if (descriptor.type === "parametric") return true;
    if (descriptor.type !== "buffer") return false;
    return descriptor.staticData !== true;
}

/** The buffers a dynamic geometry wants uploaded this frame. */
export function resolveDynamicBuffers(
    descriptor: BufferGeometry3D | ParametricGeometry3D,
): BufferGeometry3D {
    return descriptor.type === "parametric" ? evaluateParametric(descriptor) : descriptor;
}

function isArrayLike(value: unknown): boolean {
    return Array.isArray(value) || ArrayBuffer.isView(value);
}

function toFloat32(source: ArrayLike<number>): Float32Array {
    return source instanceof Float32Array ? source : new Float32Array(Array.from(source));
}

function toUint32(source: ArrayLike<number>): Uint32Array {
    return source instanceof Uint32Array ? source : new Uint32Array(Array.from(source));
}

function toVector3(three: ThreeModule, input: Vector3Input): THREE.Vector3 {
    const v = resolveVector3(input);
    return new three.Vector3(v.x, v.y, v.z);
}

/** A lathe profile is authored as Vector3s; only x (radius) and y (height) apply. */
function toVector2(three: ThreeModule, input: Vector3Input): THREE.Vector2 {
    const v = resolveVector3(input);
    return new three.Vector2(v.x, v.y);
}
