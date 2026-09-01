/**
 * `Scene3D` op list → a live, cached `THREE.Scene`.
 *
 * A `Scene3D` is rebuilt from scratch every frame (that's what makes the whole
 * design seekable), but the three objects it describes are *not*. Rebuilding a
 * scene graph at 60 fps would reallocate vertex buffers and recompile shader
 * programs continuously. So this keeps one live object per op and mutates it
 * between frames, rebuilding only when something structural actually changed.
 *
 * ── Identity, derived ─────────────────────────────────────────────────────────
 * Nothing here is keyed by hand. A `push` group is keyed by the **node id** the
 * scene recorder stamped on it, and a drawable is keyed by
 * `<enclosing node> | <kind> | <structural signature> | <nth of that shape>`.
 *
 * The signature is the same one that decides rebuild-vs-mutate, so two ops that
 * share it are *interchangeable cache entries*: everything that distinguishes
 * them — position, colour, roughness — is an in-place write on the object either
 * one would get. That is what makes conditional emission free. A builder that
 * writes `if (t > 2) g3.sphere(...)` used to shift every later op's positional
 * slot, rebuilding the tail of the cache and forcing an author to write a `key`
 * to avoid it; keyed by content, the box before it and the box after it both
 * still find their own entry, and only the sphere is built.
 *
 * Groups keep the structural path as a fallback, for the hand-built `Scene3D`
 * that opens a scope without going through a node.
 *
 * ── Sweeping ──────────────────────────────────────────────────────────────────
 * Every entry touched this frame is stamped with the frame counter. Anything not
 * touched is removed from its parent and disposed, which is what handles a
 * disappearing op without the author declaring anything.
 */

import type * as THREE from "three";
import type {
    Box3, CameraData3D, Color, Geometry3D, LightData3D,
    Material3D, Scene3D, Scene3DOp, Transform3D,
} from "@motion-script/core";
import { canvas3DResourceKey } from "@motion-script/core";
import type { ThreeModule } from "./bridge";
import { canvas3DRendererHost } from "./renderer-seam";
import { shadowQuality, toneMapping, writeColor } from "./handlers/constants";
import {
    createGeometry, geometrySignature, isDynamicGeometry,
    resolveDynamicBuffers, updateBufferGeometry,
} from "./handlers/geometry";
import { applyMaterial, createMaterial, materialSignature } from "./handlers/material";
import { applyLight, applyLightShadow, createLight, lightSignature } from "./handlers/light";
import { applyCamera, cameraMatches, createCamera } from "./handlers/camera";
import { applyTransform } from "./handlers/transform";
import { applyEnvironment, applyFog } from "./handlers/settings";
import type { TextureResolver } from "./handlers/texture";
import {
    applyModelAnimation, applyModelOverrides, createModel, modelLoaded,
    modelOverrideSignature, type ModelPlayback,
} from "./handlers/model";
import { requestCanvas3DResource } from "./bridge";

/** The ops that put a live object in the scene — everything but the tree shaping. */
type DrawableOp = Exclude<Scene3DOp, { kind: "push" } | { kind: "pop" } | { kind: "camera" }>;

/** One cached object, with the signatures that decide mutate-vs-rebuild. */
interface CachedObject {
    object: THREE.Object3D;
    kind: Scene3DOp["kind"];
    geometrySig?: string;
    materialSig?: string;
    lightSig?: string;
    /**
     * The `revision` of the parametric surface currently uploaded, when the
     * descriptor supplied one.
     *
     * Kept per cached object rather than on the descriptor because the descriptor
     * is rebuilt from scratch every frame — a `Scene3D` is a recording, so
     * there is no stable object to hang "what did I evaluate last time" on. This
     * entry *is* the thing that persists across frames.
     */
    parametricRevision?: number;
    /** Instance count, for an InstancedMesh (fixed at construction). */
    count?: number;
    /**
     * The animation mixer and actions driving one model instance.
     *
     * Per cached object rather than per file: a mixer binds to the nodes of one
     * *clone*, so two nodes drawing the same glTF need one each or they would
     * pose each other. It dies with the entry, which is all the cleanup there is
     * — three has no disposer for a mixer beyond dropping the reference.
     */
    modelPlayback?: ModelPlayback;
    /** Frame counter, for the orphan sweep. */
    seen: number;
}

/**
 * The live three scene for one `Canvas3D` node.
 *
 * One graph per node instance: two 3D nodes in a project each need their own
 * scene, camera and cache, or they'd overwrite each other's objects.
 */
export class Canvas3DGraph {
    private readonly scene: THREE.Scene;
    private camera: THREE.Camera;
    private readonly cache = new Map<string, CachedObject>();
    private frame = 0;

    constructor(private readonly three: ThreeModule) {
        this.scene = new three.Scene();
        this.camera = createCamera(three, null);
    }

    /**
     * Bring the live scene in line with `g3`, and return what to render.
     *
     * `width`/`height` are device pixels, used for the camera's aspect ratio.
     */
    sync(
        g3: Scene3D,
        width: number,
        height: number,
        textures: TextureResolver,
    ): { scene: THREE.Scene; camera: THREE.Camera } {
        this.frame++;
        const three = this.three;

        // ── Object graph ─────────────────────────────────────────────────────
        // `counters` holds the running child index at each open level, so
        // joining it yields the structural path. `parents` tracks where to attach.
        const counters: number[] = [-1];
        const parents: THREE.Object3D[] = [this.scene];
        // The path each level's *group* keys are relative to. A keyed group
        // resets it, so a node's scopes are numbered within that node.
        const roots: string[] = [""];
        // How many drawables of each `<scope|kind|signature>` have been seen this
        // frame, which is the last component of a drawable's cache key.
        const buckets = new Map<string, number>();
        // Lights, held back until the scene's bounds are known — a directional
        // light's shadow frustum is sized from them, and nothing knows the scene's
        // extent until every object in it has been attached.
        const lights: { light: THREE.Light; descriptor: LightData3D }[] = [];
        let pendingCamera: { descriptor: CameraData3D; parent: THREE.Object3D } | null = null;
        let cameraSeen = false;

        for (const op of g3.ops()) {
            if (op.kind === "pop") {
                // Guard against a malformed list; Scene3D.assertBalanced()
                // normally catches this at the author's source first.
                if (parents.length > 1) { parents.pop(); counters.pop(); roots.pop(); }
                continue;
            }

            counters[counters.length - 1]++;
            const root = roots[roots.length - 1];
            const parent = parents[parents.length - 1];

            if (op.kind === "push") {
                const path = root
                    ? `${root}.${counters[counters.length - 1]}`
                    : String(counters[counters.length - 1]);
                const group = this.resolveGroup(path, op.transform, parent);
                parents.push(group);
                counters.push(-1);
                roots.push(op.transform?.key ? `@${op.transform.key}` : path);
                continue;
            }

            if (op.kind === "camera") {
                // Held back with the lights: the clip planes are derived from the
                // scene's own extent, which nothing knows until every object is
                // attached. Parenting is recorded now, since it is positional.
                pendingCamera = { descriptor: op.camera, parent };
                cameraSeen = true;
                continue;
            }

            const signatures = signaturesFor(op);
            const entry = this.resolveDrawable(op, keyFor(root, op, signatures, buckets), parent, textures, signatures);
            if (entry && op.kind === "light") {
                lights.push({ light: entry.object as THREE.Light, descriptor: op.light });
            }
        }

        this.sweep();

        // ── Everything sized from the scene's own extent ─────────────────────
        // After the sweep, so the box covers exactly what is in the scene now.
        // Two things read it — a directional light's shadow frustum and the
        // camera's clip planes — and both were previously constants that were
        // wrong at every scale but one.
        const bounds = this.sceneBounds();
        for (const { light, descriptor } of lights) {
            applyLightShadow(light, descriptor, bounds);
        }
        if (pendingCamera) {
            // Parented rather than placed absolutely, so a camera inside a moving
            // group is carried by it — three composes the world matrix.
            this.resolveCamera(pendingCamera.descriptor, width, height, pendingCamera.parent, bounds);
        }

        // ── Scene settings ───────────────────────────────────────────────────
        applyFog(three, this.scene, g3.fogDescriptor());
        // The renderer is the platform's (see ./renderer-seam). A host that has no
        // WebGL returns null here and environment maps are skipped, which is the
        // same degradation as three not having loaded yet.
        const host = canvas3DRendererHost();
        // One call, because an environment *is* the sky: it lights the scene and,
        // when asked, is what you see behind it. Anything flatter than a sky is a
        // 2D fill on the viewport and never reaches here.
        applyEnvironment(three, this.scene, g3.environmentDescriptor(), host?.active() ?? null);

        const shadows = g3.shadowSettings();
        const tone = g3.toneSettings();
        const quality = shadowQuality(three, shadows?.quality);
        host?.applySettings(three, {
            shadowsEnabled: shadows?.enabled === true,
            shadowType: quality.type,
            toneMapping: toneMapping(three, tone?.mapping),
            toneMappingExposure: tone?.exposure ?? 1,
        });
        // Map resolution is per light in three but is one scene-wide decision
        // here, so it is pushed down rather than asked for twice.
        for (const { light } of lights) {
            const map = (light as { shadow?: THREE.LightShadow }).shadow;
            if (map && map.mapSize.x !== quality.mapSize) {
                map.mapSize.set(quality.mapSize, quality.mapSize);
                map.map?.dispose();
                map.map = null as never;
            }
        }

        // No camera op: fall back to the renderer's own framing, hung off the scene.
        if (!cameraSeen) this.resolveCamera(null, width, height, this.scene, bounds);
        return { scene: this.scene, camera: this.camera };
    }

    /**
     * The scene's world-space extent, or `null` when it is empty.
     *
     * Reused between frames only in the sense that three recomputes it here each
     * time: it is one traversal over objects whose matrices are already up to
     * date, and it is what stops a shadow frustum from being a constant that is
     * wrong at every scale but one.
     */
    private sceneBounds(): Box3 | null {
        this.scene.updateMatrixWorld(true);
        const box = new this.three.Box3().setFromObject(this.scene);
        if (box.isEmpty()) return null;
        return {
            min: { x: box.min.x, y: box.min.y, z: box.min.z },
            max: { x: box.max.x, y: box.max.y, z: box.max.z },
        };
    }

    /** A `push` group: reused when present, created and attached otherwise. */
    private resolveGroup(path: string, transform: Transform3D | undefined, parent: THREE.Object3D): THREE.Object3D {
        const key = transform?.key ? `@${transform.key}|push` : `${path}|push`;
        let entry = this.cache.get(key);

        if (!entry || entry.kind !== "push") {
            this.discard(entry);
            const group = new this.three.Group();
            entry = { object: group, kind: "push", seen: this.frame };
            this.cache.set(key, entry);
        }

        entry.seen = this.frame;
        applyTransform(entry.object, transform);
        if (entry.object.parent !== parent) parent.add(entry.object);
        return entry.object;
    }

    /** Create-or-mutate one drawable op. Returns the entry, or undefined. */
    private resolveDrawable(
        op: DrawableOp,
        key: string,
        parent: THREE.Object3D,
        textures: TextureResolver,
        signatures: Partial<CachedObject>,
    ): CachedObject | undefined {
        let entry = this.cache.get(key);

        if (entry && entry.kind !== op.kind) {
            this.discard(entry);
            entry = undefined;
        }

        entry = this.ensure(entry, key, op, textures, signatures);
        if (!entry) return undefined;

        entry.seen = this.frame;
        this.mutate(entry, op, textures);

        if (entry.object.parent !== parent) parent.add(entry.object);
        return entry;
    }

    /**
     * The cache entry for `op`, rebuilding when a structural signature changed.
     * Returns undefined for an op this backend can't build yet (e.g. `model`).
     */
    private ensure(
        entry: CachedObject | undefined,
        key: string,
        op: DrawableOp,
        textures: TextureResolver,
        signatures: Partial<CachedObject>,
    ): CachedObject | undefined {
        // Belt and braces: the signature is *in* the key now, so a found entry
        // always matches. Kept because it is the invariant this cache rests on,
        // and a silent mismatch would mutate the wrong object type.
        if (entry && sameSignatures(entry, signatures)) return entry;

        this.discard(entry);
        const built = this.build(op, textures);
        if (!built) return undefined;

        const created: CachedObject = { object: built, kind: op.kind, seen: this.frame, ...signatures };
        // `build` has just evaluated the surface to create the geometry, so record
        // which revision that was. Without this the first `refreshDynamicGeometry`
        // of a versioned surface sees `undefined !== revision` and evaluates the
        // whole grid a second time for the same result.
        const geometry = (op as { geometry?: Geometry3D }).geometry;
        if (geometry?.type === "parametric") created.parametricRevision = geometry.revision;
        this.cache.set(key, created);
        return created;
    }

    /** Build the three object for an op from scratch. */
    private build(
        op: DrawableOp,
        textures: TextureResolver,
    ): THREE.Object3D | null {
        const three = this.three;

        switch (op.kind) {
            case "mesh": {
                const geometry = createGeometry(three, op.geometry);
                const material = this.buildMaterials(op.material, textures);
                return new three.Mesh(geometry, material as THREE.Material);
            }

            case "light":
                return createLight(three, op.light);

            case "instances": {
                const geometry = createGeometry(three, op.geometry);
                const material = createMaterial(three, op.material, textures);
                const mesh = new three.InstancedMesh(geometry, material, Math.max(1, op.instances.length));
                // Per-instance matrices are rewritten every frame, so tell three not
                // to assume they're static.
                mesh.instanceMatrix.setUsage(three.DynamicDrawUsage);
                return mesh;
            }

            case "points": {
                const geometry = createGeometry(three, op.geometry);
                const material = createMaterial(three, op.material, textures);
                return new three.Points(geometry, material as THREE.PointsMaterial);
            }

            case "line": {
                const geometry = createGeometry(three, op.geometry);
                const material = createMaterial(three, op.material, textures) as THREE.LineBasicMaterial;
                const line = op.mode === "segments"
                    ? new three.LineSegments(geometry, material)
                    : op.mode === "loop"
                        ? new three.LineLoop(geometry, material)
                        : new three.Line(geometry, material);
                // A dashed line needs per-vertex distances along the line; without
                // this the dashes don't appear at all.
                if (op.material.type === "lineDashed") line.computeLineDistances();
                return line;
            }

            case "sprite": {
                const material = createMaterial(three, op.material, textures) as THREE.SpriteMaterial;
                return new three.Sprite(material);
            }

            case "model": {
                const model = createModel(op.src);
                // Not loaded yet. Queue the file and leave the slot empty: the
                // caller's re-render loop drains the queue and comes back, which
                // is the same path a cold three runtime takes.
                if (!model) requestCanvas3DResource(canvas3DResourceKey("gltf", op.src), "gltf");
                return model;
            }

            default:
                return null;
        }
    }

    private buildMaterials(
        descriptor: Material3D | readonly Material3D[],
        textures: TextureResolver,
    ): THREE.Material | THREE.Material[] {
        if (Array.isArray(descriptor)) {
            return descriptor.map((entry) => createMaterial(this.three, entry, textures));
        }
        return createMaterial(this.three, descriptor as Material3D, textures);
    }

    /** Write this frame's values onto an existing object. The cheap path. */
    private mutate(
        entry: CachedObject,
        op: DrawableOp,
        textures: TextureResolver,
    ): void {
        const three = this.three;
        applyTransform(entry.object, op.transform);

        switch (op.kind) {
            case "mesh":
            case "points":
            case "line": {
                const mesh = entry.object as THREE.Mesh;
                this.refreshDynamicGeometry(mesh, op.geometry, entry);
                this.applyMaterials(mesh.material, op.kind === "mesh" ? op.material : op.material, textures);
                break;
            }

            case "instances": {
                const mesh = entry.object as THREE.InstancedMesh;
                this.refreshDynamicGeometry(mesh, op.geometry, entry);
                applyMaterial(three, mesh.material as THREE.Material, op.material, textures);
                this.writeInstances(mesh, op.instances, op.colors);
                break;
            }

            case "sprite":
                applyMaterial(three, (entry.object as THREE.Sprite).material, op.material, textures);
                break;

            case "light":
                applyLight(three, entry.object as THREE.Light, op.light);
                break;

            case "model":
                // Both of these are cheap no-ops for the common case — a model
                // with no clips and no overrides — so there is nothing to gate
                // them on. The mixer is kept on the entry because it binds to
                // this clone and has to outlive the frame.
                entry.modelPlayback = applyModelAnimation(
                    three, entry.object, op.src, op.animation, entry.modelPlayback,
                );
                applyModelOverrides(three, entry.object, op.override, textures);
                break;
        }
    }

    private applyMaterials(
        target: THREE.Material | THREE.Material[],
        descriptor: Material3D | readonly Material3D[],
        textures: TextureResolver,
    ): void {
        if (Array.isArray(target) && Array.isArray(descriptor)) {
            const count = Math.min(target.length, descriptor.length);
            for (let i = 0; i < count; i++) applyMaterial(this.three, target[i], descriptor[i], textures);
            return;
        }
        if (!Array.isArray(target) && !Array.isArray(descriptor)) {
            applyMaterial(this.three, target, descriptor as Material3D, textures);
        }
    }

    /**
     * Re-upload a dynamic geometry's vertex data.
     *
     * A `buffer`/`parametric` geometry is the animated-mesh path: its arrays may
     * have been mutated in place, which identity comparison can't see, so the
     * contents are written every frame. When a length changed, the in-place write
     * is impossible and the geometry is rebuilt.
     */
    private refreshDynamicGeometry(
        mesh: THREE.Mesh | THREE.Points | THREE.Line | THREE.InstancedMesh,
        descriptor: Geometry3D,
        entry: CachedObject,
    ): void {
        if (!isDynamicGeometry(descriptor)) return;

        // A parametric surface that says when it changed is only re-evaluated
        // when it does. Without this, every frame runs `vertex` over the whole
        // grid — ~6.6k calls at the default `segments: 80` — recomputes normals
        // and re-uploads, for a surface that may not have moved since the last
        // frame. Frames are drawn for all sorts of reasons that have nothing to
        // do with the mesh: a gizmo drag elsewhere in the scene repaints at
        // pointer rate, and the camera orbiting changes no vertex at all.
        //
        // Opt-in by design (see `ParametricGeometry3D.revision`): with no
        // revision the unconditional path is kept, because `vertex` is a closure
        // and nothing here can see what it captured.
        if (descriptor.type === "parametric" && descriptor.revision !== undefined) {
            if (entry.parametricRevision === descriptor.revision) return;
            entry.parametricRevision = descriptor.revision;
        }

        const buffers = resolveDynamicBuffers(descriptor);
        if (updateBufferGeometry(mesh.geometry, buffers)) return;

        // Length changed — reallocate.
        mesh.geometry.dispose();
        mesh.geometry = createGeometry(this.three, buffers);
        entry.geometrySig = geometrySignature(descriptor);
        if ((mesh as THREE.Line).computeLineDistances && (mesh as THREE.Line).isLine) {
            (mesh as THREE.Line).computeLineDistances();
        }
    }

    /** Write per-instance matrices (and colours) into an InstancedMesh. */
    private writeInstances(
        mesh: THREE.InstancedMesh,
        instances: readonly Transform3D[],
        colors: readonly (string | readonly number[])[] | undefined,
    ): void {
        const three = this.three;
        // One scratch object reused for every instance — this runs thousands of
        // times per frame, so it must not allocate.
        const scratch = (mesh.userData.__scratch as THREE.Object3D | undefined)
            ?? (mesh.userData.__scratch = new three.Object3D());

        const count = Math.min(instances.length, mesh.count);
        for (let i = 0; i < count; i++) {
            applyTransform(scratch, instances[i]);
            scratch.updateMatrix();
            mesh.setMatrixAt(i, scratch.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;

        // Instances beyond the supplied list would otherwise render at whatever
        // matrix they last held; collapse them to nothing.
        if (count < mesh.count) {
            scratch.position.set(0, 0, 0);
            scratch.rotation.set(0, 0, 0);
            scratch.scale.set(0, 0, 0);
            scratch.updateMatrix();
            for (let i = count; i < mesh.count; i++) mesh.setMatrixAt(i, scratch.matrix);
        }

        if (colors) {
            const color = new three.Color();
            for (let i = 0; i < Math.min(colors.length, mesh.count); i++) {
                // Shared writer so instance colours go through core's parser and
                // the same sRGB decode as every other colour in the scene.
                writeColor(three, color, colors[i] as Color);
                mesh.setColorAt(i, color);
            }
            if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        }
    }

    /** Reuse or replace the camera, then frame it to the destination size. */
    private resolveCamera(
        descriptor: CameraData3D | null,
        width: number,
        height: number,
        parent: THREE.Object3D,
        bounds?: Box3 | null,
    ): void {
        const three = this.three;
        if (descriptor && !cameraMatches(three, this.camera, descriptor)) {
            this.camera = createCamera(three, descriptor);
        }
        applyCamera(three, this.camera, descriptor, width, height, bounds);

        // Attached only when a *group* declared it, which is what lets a camera
        // ride inside an animated rig. A camera at the scene root already places
        // itself in world space, so leaving it detached keeps the scene's own
        // children to the things that actually draw.
        if (parent !== this.scene) {
            if (this.camera.parent !== parent) parent.add(this.camera);
        } else if (this.camera.parent) {
            this.camera.removeFromParent();
        }
    }

    /** Drop every entry not touched this frame. Handles disappearing ops. */
    private sweep(): void {
        for (const [key, entry] of this.cache) {
            if (entry.seen === this.frame) continue;
            this.discard(entry);
            this.cache.delete(key);
        }
    }

    /** Detach and free an object's GPU resources. */
    private discard(entry: CachedObject | undefined): void {
        if (!entry) return;
        entry.object.removeFromParent();
        disposeObject(entry.object);
    }

    /**
     * Free everything this graph owns.
     *
     * three's geometries, materials and render targets are not GC-managed, so
     * skipping this leaks GPU memory across an HMR reload or a scene switch until
     * the context is lost.
     */
    dispose(): void {
        for (const entry of this.cache.values()) this.discard(entry);
        this.cache.clear();

        const environment = this.scene.userData.__roomEnvironment as THREE.Texture | undefined;
        environment?.dispose();
        this.scene.userData.__roomEnvironment = undefined;
        this.scene.environment = null;
        this.scene.clear();
    }
}

/**
 * The cache key for a drawable — derived, never written.
 *
 * `<enclosing scope> | <kind> | <structural signature> | <nth of that shape>`.
 * Two ops with the same signature are interchangeable cache entries (everything
 * that differs between them is an in-place write), so counting them within the
 * scope gives every one a stable slot without anyone naming it — and inserting a
 * *different* shape between them shifts nothing, which is the whole reason the
 * old positional path needed an author-supplied `key`.
 */
function keyFor(
    scope: string,
    op: DrawableOp,
    signatures: Partial<CachedObject>,
    buckets: Map<string, number>,
): string {
    const shape = `${scope}|${op.kind}|${signatures.geometrySig ?? ""}|${signatures.materialSig ?? ""}|${signatures.lightSig ?? ""}|${signatures.count ?? ""}`;
    const nth = buckets.get(shape) ?? 0;
    buckets.set(shape, nth + 1);
    return `${shape}#${nth}`;
}

/** The structural signatures for an op — any difference forces a rebuild. */
function signaturesFor(op: DrawableOp): Partial<CachedObject> {
    switch (op.kind) {
        case "mesh":
            return {
                geometrySig: geometrySignature(op.geometry),
                materialSig: materialsSignature(op.material),
            };
        case "points":
            return { geometrySig: geometrySignature(op.geometry), materialSig: materialSignature(op.material) };
        case "line":
            // Mode picks the three class (Line / LineSegments / LineLoop), so it
            // can't be mutated — it belongs in the signature.
            return {
                geometrySig: geometrySignature(op.geometry),
                materialSig: `${op.mode}|${materialSignature(op.material)}`,
            };
        case "instances":
            // InstancedMesh fixes its count at construction.
            return {
                geometrySig: geometrySignature(op.geometry),
                materialSig: materialSignature(op.material),
                count: op.instances.length,
            };
        case "sprite":
            return { materialSig: materialSignature(op.material) };
        case "light":
            return { lightSig: lightSignature(op.light) };
        case "model":
            // The loaded flag is what makes the model appear at all: the op is
            // identical on the frame before and after the file lands, so without
            // it the empty slot built the first time would be kept forever.
            return {
                geometrySig: `${op.src}|${modelLoaded(op.src) ? "1" : "0"}`,
                materialSig: modelOverrideSignature(op.override),
            };
        default:
            return {};
    }
}

function materialsSignature(descriptor: Material3D | readonly Material3D[]): string {
    if (Array.isArray(descriptor)) return descriptor.map(materialSignature).join("&");
    return materialSignature(descriptor as Material3D);
}

function sameSignatures(entry: CachedObject, signatures: Partial<CachedObject>): boolean {
    return entry.geometrySig === signatures.geometrySig
        && entry.materialSig === signatures.materialSig
        && entry.lightSig === signatures.lightSig
        && entry.count === signatures.count;
}

/**
 * Recursively free an object's geometry and materials.
 *
 * Textures are deliberately *not* disposed here — they're shared across meshes and
 * managed by the texture cache, which releases them on unmount. See the note in
 * `handlers/texture.ts` for why that beats reference counting.
 */
function disposeObject(object: THREE.Object3D): void {
    const mesh = object as THREE.Mesh;
    mesh.geometry?.dispose?.();

    const material = mesh.material;
    if (Array.isArray(material)) for (const entry of material) entry.dispose();
    else material?.dispose?.();

    for (const child of [...object.children]) disposeObject(child);
}
