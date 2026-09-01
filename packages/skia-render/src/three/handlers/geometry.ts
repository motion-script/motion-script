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
import {
    cylinderRadii, evaluateParametric, evaluateRoundedBox, resolveBevel3D,
    resolveVector3, segmentsOf, toPathString,
} from "@motion-script/core";
import type { ThreeModule } from "../bridge";
import { canvas3DModel } from "../bridge";
import { deg } from "./constants";

/** Build a three geometry for `descriptor`. */
export function createGeometry(three: ThreeModule, descriptor: Geometry3D): THREE.BufferGeometry {
    switch (descriptor.type) {
        case "box": {
            const [sx, sy, sz] = segmentsOf(descriptor.segments, [1, 1, 1]);
            const width = descriptor.width ?? 1;
            const height = descriptor.height ?? 1;
            const depth = descriptor.depth ?? 1;
            // A rounded box has no three primitive — its surface is built in core
            // and arrives as ordinary vertex buffers. See `evaluateRoundedBox`.
            if ((descriptor.cornerRadius ?? 0) > 0) {
                return createBufferGeometry(three, evaluateRoundedBox({
                    width, height, depth,
                    radius: descriptor.cornerRadius!,
                    segments: [sx, sy, sz],
                }));
            }
            return new three.BoxGeometry(width, height, depth, sx, sy, sz);
        }

        case "sphere": {
            const [longitude, latitude] = segmentsOf(descriptor.segments, [32, 16]);
            return new three.SphereGeometry(
                descriptor.radius ?? 1,
                longitude, latitude,
                deg(descriptor.startAngle ?? 0), deg(descriptor.sweep ?? 360),
                deg(descriptor.startLatitude ?? 0), deg(descriptor.latitudeSweep ?? 180),
            );
        }

        case "plane": {
            const [sx, sy] = segmentsOf(descriptor.segments, [1, 1]);
            return new three.PlaneGeometry(
                descriptor.width ?? 1, descriptor.height ?? 1, sx, sy,
            );
        }

        case "cylinder": {
            const [top, bottom] = cylinderRadii(descriptor.radius);
            const [radial, heightSegments] = segmentsOf(descriptor.segments, [32, 1]);
            return new three.CylinderGeometry(
                top, bottom, descriptor.height ?? 1,
                radial, heightSegments,
                // `capped` is the positive spelling of three's `openEnded`.
                !(descriptor.capped ?? true),
                deg(descriptor.startAngle ?? 0), deg(descriptor.sweep ?? 360),
            );
        }

        case "cone": {
            const [radial, heightSegments] = segmentsOf(descriptor.segments, [32, 1]);
            return new three.ConeGeometry(
                descriptor.radius ?? 1, descriptor.height ?? 1,
                radial, heightSegments,
                !(descriptor.capped ?? true),
                deg(descriptor.startAngle ?? 0), deg(descriptor.sweep ?? 360),
            );
        }

        case "torus": {
            const [radial, tubular] = segmentsOf(descriptor.segments, [16, 48]);
            return new three.TorusGeometry(
                descriptor.radius ?? 1, descriptor.thickness ?? 0.4,
                radial, tubular,
                deg(descriptor.sweep ?? 360),
            );
        }

        case "torusKnot": {
            const [tubular, radial] = segmentsOf(descriptor.segments, [64, 8]);
            const [p, q] = descriptor.windings ?? [2, 3];
            return new three.TorusKnotGeometry(
                descriptor.radius ?? 1, descriptor.thickness ?? 0.4,
                tubular, radial, p, q,
            );
        }

        case "circle": {
            const [segments] = segmentsOf(descriptor.segments, [32]);
            return new three.CircleGeometry(
                descriptor.radius ?? 1, segments,
                deg(descriptor.startAngle ?? 0), deg(descriptor.sweep ?? 360),
            );
        }

        case "ring": {
            const [around, radial] = segmentsOf(descriptor.segments, [32, 1]);
            return new three.RingGeometry(
                descriptor.innerRadius ?? 0.5, descriptor.radius ?? 1,
                around, radial,
                deg(descriptor.startAngle ?? 0), deg(descriptor.sweep ?? 360),
            );
        }

        case "capsule": {
            const [radial, cap] = segmentsOf(descriptor.segments, [16, 8]);
            return new three.CapsuleGeometry(
                descriptor.radius ?? 0.5, descriptor.height ?? 1, cap, radial,
            );
        }

        case "polyhedron": {
            const [detail] = segmentsOf(descriptor.segments, [1]);
            // `segmentsOf` floors at 1, but a polyhedron's subdivision is a
            // *detail* count where 0 is the un-subdivided solid — and that is the
            // default anyone writing `<Icosahedron3D/>` expects to see.
            return createPolyhedron(
                three, descriptor.shape, descriptor.radius ?? 1,
                descriptor.segments === undefined ? 0 : detail,
            );
        }

        case "extrude":
            return createExtrude(three, descriptor);

        case "lathe": {
            const [segments] = segmentsOf(descriptor.segments, [12]);
            return new three.LatheGeometry(
                descriptor.points.map((p) => toVector2(three, p)),
                segments,
                deg(descriptor.startAngle ?? 0), deg(descriptor.sweep ?? 360),
            );
        }

        case "tube": {
            const [along, around] = segmentsOf(descriptor.segments, [64, 8]);
            return new three.TubeGeometry(
                new three.CatmullRomCurve3(descriptor.points.map((p) => toVector3(three, p)), descriptor.closed ?? false),
                along, descriptor.radius ?? 1, around, descriptor.closed ?? false,
            );
        }

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

        case "modelGeometry": {
            // An empty geometry both while the file is loading and when the named
            // node is not in it: a mesh that draws nothing is the right answer to
            // "not yet" and to "not there", and neither is worth a throw
            // mid-frame. The reconciler rebuilds once the file lands, because
            // {@link geometrySignature} folds the loaded flag in.
            const mesh = findModelMesh(canvas3DModel(descriptor.src)?.scene, descriptor.node);
            // Cloned because the caller owns what it is handed and disposes it on
            // any structural change — sharing the master graph's buffers would
            // free them out from under every other user of the same file.
            return mesh?.geometry.clone() ?? new three.BufferGeometry();
        }

        default:
            return new three.BufferGeometry();
    }
}

/**
 * The mesh a {@link ModelGeometry3D} names, or the first one in the file.
 *
 * "First mesh found" is depth-first in graph order, which is the order an
 * exporter wrote the nodes — so for the overwhelmingly common single-mesh file
 * it is simply "the mesh", and no author has to learn a name to use one.
 */
function findModelMesh(root: THREE.Object3D | undefined, name: string | undefined): THREE.Mesh | null {
    if (!root) return null;

    if (name !== undefined) {
        const named = root.getObjectByName(name) as THREE.Mesh | undefined;
        return named?.isMesh ? named : null;
    }

    let first: THREE.Mesh | null = null;
    root.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (first === null && mesh.isMesh) first = mesh;
    });
    return first;
}

function createPolyhedron(
    three: ThreeModule,
    shape: "tetrahedron" | "octahedron" | "icosahedron" | "dodecahedron" | undefined,
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
 * the same `PathData`/`PathBuilder` a 2D `Path` node does — under the same prop
 * name — converted here through three's SVG-path reader so an existing outline
 * becomes a solid unchanged.
 */
function createExtrude(
    three: ThreeModule,
    descriptor: Extract<Geometry3D, { type: "extrude" }>,
): THREE.BufferGeometry {
    const source = descriptor.path;
    const data = typeof source === "object" && "toPathState" in source
        ? (source as { toPathState(): { data: unknown } }).toPathState().data
        : source;

    const shapes = pathToShapes(three, toPathString(data as never));
    if (shapes.length === 0) return new three.BufferGeometry();

    const [curveSegments] = segmentsOf(descriptor.segments, [12]);
    const bevel = resolveBevel3D(descriptor.bevel);

    return new three.ExtrudeGeometry(shapes, {
        depth: descriptor.depth ?? 1,
        curveSegments,
        bevelEnabled: bevel !== null,
        bevelThickness: bevel?.thickness ?? 0.2,
        bevelSize: bevel?.size ?? 0.1,
        bevelOffset: bevel?.offset ?? 0,
        bevelSegments: bevel?.segments ?? 3,
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

    // Whether the file has arrived is not in the descriptor, and it has to be:
    // the descriptor is identical on the frame before and after a model loads, so
    // without this the empty geometry built the first time would never be
    // replaced by the real one.
    if (descriptor.type === "modelGeometry") {
        parts.push(`loaded=${canvas3DModel(descriptor.src) ? "1" : "0"}`);
    }
    const bag = descriptor as unknown as Record<string, unknown>;

    for (const key of Object.keys(bag).sort()) {
        if (key === "type") continue;
        // `revision` and `staticData` describe a geometry's *contents*, never its
        // structure — how many vertices there are, which attributes exist, what
        // class of geometry it is. Letting them in inverts what they are for:
        // bumping `revision` is documented as forcing a **re-upload**
        // (`updateBufferGeometry`'s in-place `array.set`), but as a signature key
        // it would instead fail `sameSignatures` and dispose and rebuild the whole
        // `BufferGeometry` — the expensive path it exists to avoid. Structural
        // change is still caught: by `segments`, by array lengths, and by
        // `updateBufferGeometry` returning false when a length moved.
        if (key === "revision" || key === "staticData") continue;
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
        } else if (isBulkArray(value)) {
            // Vertex data: length only. Contents are handled by the in-place
            // upload path, and folding them in here would rebuild every frame.
            parts.push(`${key}#${(value as ArrayLike<number>).length}`);
        } else if (Array.isArray(value)) {
            // A short tuple — `segments`, `windings`, a `[top, bottom]` radius.
            // These *are* structural, and keying them by length alone would make
            // `segments: [8, 8]` and `segments: [64, 64]` the same geometry.
            parts.push(`${key}=${JSON.stringify(value)}`);
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

/**
 * True for an array big enough to be vertex data rather than a parameter tuple.
 *
 * A typed array always is. A plain array is judged by length: every tuple the
 * descriptors take is at most three long (`segments`, `windings`, a tapered
 * `radius`), and every plain-array *buffer* an author hands in is far longer.
 */
function isBulkArray(value: unknown): boolean {
    if (ArrayBuffer.isView(value)) return true;
    return Array.isArray(value) && value.length > 4;
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
