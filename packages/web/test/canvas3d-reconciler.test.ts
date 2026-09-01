import { describe, it, expect, beforeAll } from "vitest";
import type * as THREE from "three";
import { Geo, Graphics2D, Graphics3D, Mat, Scene3D, Tex, type RasterizedSurface } from "@motion-script/core";
import { loadCanvas3D, threeModule } from "@motion-script/skia-render/three/bridge";
import { Canvas3DGraph } from "@motion-script/skia-render/three/reconciler";
import { TextureResolver, type Canvas3DAssets } from "@motion-script/skia-render/three/handlers/texture";
import type { ThreeModule } from "@motion-script/skia-render/three/bridge";

/**
 * The reconciler needs no CanvasKit surface and no WebGL context — `sync()` only
 * builds and mutates a `THREE.Scene`. So the mutate-vs-rebuild behaviour that all
 * the 3D performance rests on can be tested directly.
 */
let three: ThreeModule;
let textures: TextureResolver;

/** No assets: texture-less descriptors never reach the resolver. */
const assets: Canvas3DAssets = {
    getImagePixels: () => null,
    release3DTexture: () => { },
};

beforeAll(async () => {
    await loadCanvas3D();
    three = threeModule()!;
    textures = new TextureResolver(three, assets);
});

/**
 * Reconcile the drawables a single node would emit.
 *
 * These cases are about the reconciler — mutate-vs-rebuild, keying, sweeping — so
 * they record a `Graphics3D` straight into a scene rather than building a `Node3D`
 * tree, which would bury the op list they actually assert on.
 */
function sync(graph: Canvas3DGraph, build: (g3: Graphics3D) => unknown) {
    const g3 = new Graphics3D();
    build(g3);
    return graph.sync(new Scene3D().draw(g3), 800, 600, textures);
}

/** Reconcile a whole scene — for the cases about lights, camera, fog or nesting. */
function syncScene(graph: Canvas3DGraph, build: (scene: Scene3D) => unknown) {
    const scene = new Scene3D();
    build(scene);
    return graph.sync(scene, 800, 600, textures);
}

/** Open a keyed scope, record `build`'s drawables inside it, and close it. */
function scope(scene: Scene3D, id: string, transform: object, build: (g3: Graphics3D) => unknown): Scene3D {
    const g3 = new Graphics3D();
    build(g3);
    scene.begin({ id, transform });
    return scene.draw(g3).end();
}

describe("Canvas3DGraph reconciliation", () => {
    it("builds the described object graph", () => {
        const graph = new Canvas3DGraph(three);
        const { scene } = syncScene(graph, (s) => s.draw(new Graphics3D().box()).light({ type: "ambient" }));

        expect(scene.children).toHaveLength(2);
        expect(scene.children[0].type).toBe("Mesh");
        expect(scene.children[1].type).toBe("AmbientLight");
        graph.dispose();
    });

    it("nests group() children under a Group", () => {
        const graph = new Canvas3DGraph(three);
        const { scene } = syncScene(graph, (s) => {
            s.draw(new Graphics3D().box());
            scope(s, "inner", { position: [1, 0, 0] }, (i) => i.sphere().sphere());
        });

        expect(scene.children).toHaveLength(2);
        const group = scene.children[1];
        expect(group.type).toBe("Group");
        expect(group.children).toHaveLength(2);
        expect(group.position.x).toBe(1);
        graph.dispose();
    });

    // The load-bearing performance property: an unchanged descriptor must reuse the
    // same GPU resources rather than reallocating them every frame.
    it("reuses the same object, geometry and material across frames", () => {
        const graph = new Canvas3DGraph(three);

        const first = sync(graph, (g3) => g3.box({ width: 2, fill: "red" }));
        const mesh1 = first.scene.children[0] as never as { uuid: string; geometry: { uuid: string }; material: { uuid: string } };
        const ids = { object: mesh1.uuid, geometry: mesh1.geometry.uuid, material: mesh1.material.uuid };

        const second = sync(graph, (g3) => g3.box({ width: 2, fill: "red" }));
        const mesh2 = second.scene.children[0] as never as typeof mesh1;

        expect(mesh2.uuid).toBe(ids.object);
        expect(mesh2.geometry.uuid).toBe(ids.geometry);
        expect(mesh2.material.uuid).toBe(ids.material);
        graph.dispose();
    });

    it("writes a changed transform in place, without rebuilding", () => {
        const graph = new Canvas3DGraph(three);

        const first = sync(graph, (g3) => g3.box({ position: [0, 0, 0] }));
        const uuid = first.scene.children[0].uuid;

        const second = sync(graph, (g3) => g3.box({ position: [5, 1, 2] }));
        expect(second.scene.children[0].uuid).toBe(uuid);
        expect(second.scene.children[0].position.toArray()).toEqual([5, 1, 2]);
        graph.dispose();
    });

    it("writes a changed material colour in place, without recompiling", () => {
        const graph = new Canvas3DGraph(three);

        const first = sync(graph, (g3) => g3.box({ fill: "red" }));
        const material1 = (first.scene.children[0] as never as { material: { uuid: string } }).material;
        const uuid = material1.uuid;

        const second = sync(graph, (g3) => g3.box({ fill: "blue" }));
        const material2 = (second.scene.children[0] as never as { material: { uuid: string; color: { b: number } } }).material;

        // Same material object — a colour tween must never recompile the program.
        expect(material2.uuid).toBe(uuid);
        expect(material2.color.b).toBeGreaterThan(0.5);
        graph.dispose();
    });

    // three geometries are immutable, so a parameter change *must* rebuild — this
    // is the expensive case the docs steer authors away from.
    it("rebuilds geometry when a parameter changes, and disposes the old one", () => {
        const graph = new Canvas3DGraph(three);

        const first = sync(graph, (g3) => g3.box({ width: 2 }));
        const old = (first.scene.children[0] as never as { geometry: { uuid: string } }).geometry;
        let disposed = false;
        old.addEventListener?.("dispose", () => { disposed = true; });

        const second = sync(graph, (g3) => g3.box({ width: 4 }));
        const next = (second.scene.children[0] as never as { geometry: { uuid: string } }).geometry;

        expect(next.uuid).not.toBe(old.uuid);
        expect(disposed).toBe(true);
        graph.dispose();
    });

    // `transparent` is derived, not asked for. It used to be a second flag an
    // author had to remember to pair with a fade, and forgetting it made
    // `opacity: 0.5` silently do nothing.
    it("turns blending on for anything that needs it, with no flag written", () => {
        const graph = new Canvas3DGraph(three);

        const faded = sync(graph, (g3) => g3.box({ material: Mat.basic({ opacity: 0.05 }) }));
        expect((faded.scene.children[0] as THREE.Mesh).material).toMatchObject({
            transparent: true, opacity: 0.05,
        });
        graph.dispose();

        // A colour carrying alpha counts too, and folds into the opacity.
        const graph2 = new Canvas3DGraph(three);
        const tinted = sync(graph2, (g3) => g3.box({ fill: "white/10" }));
        expect((tinted.scene.children[0] as THREE.Mesh).material.transparent).toBe(true);
        graph2.dispose();

        // A fully opaque material is left alone — blending costs a depth sort.
        const graph3 = new Canvas3DGraph(three);
        const solid = sync(graph3, (g3) => g3.box({ fill: "white" }));
        expect((solid.scene.children[0] as THREE.Mesh).material.transparent).toBe(false);
        graph3.dispose();
    });

    // The other half of the same decision. three writes depth for every material,
    // so a translucent mesh used to punch a near-invisible hole through whatever
    // was drawn after it until an author paired the two flags by hand.
    it("stops a blended surface writing depth, unless it says otherwise", () => {
        const graph = new Canvas3DGraph(three);

        const faded = sync(graph, (g3) => g3.box({ material: Mat.basic({ opacity: 0.4 }) }));
        expect((faded.scene.children[0] as THREE.Mesh).material.depthWrite).toBe(false);
        graph.dispose();

        const graph2 = new Canvas3DGraph(three);
        const solid = sync(graph2, (g3) => g3.box({ fill: "white" }));
        expect((solid.scene.children[0] as THREE.Mesh).material.depthWrite).toBe(true);
        graph2.dispose();

        // An explicit value wins — a translucent surface that should occlude.
        const graph3 = new Canvas3DGraph(three);
        const forced = sync(graph3, (g3) =>
            g3.box({ material: Mat.basic({ opacity: 0.4, depthWrite: true }) }));
        expect((forced.scene.children[0] as THREE.Mesh).material.depthWrite).toBe(true);
        graph3.dispose();
    });

    // Latched: a fade back to full opacity must not recompile a second time.
    it("keeps blending on once a fade has started", () => {
        const graph = new Canvas3DGraph(three);

        sync(graph, (g3) => g3.box({ material: Mat.basic({ opacity: 0.5 }) }));
        const back = sync(graph, (g3) => g3.box({ material: Mat.basic({ opacity: 1 }) }));

        expect((back.scene.children[0] as THREE.Mesh).material.transparent).toBe(true);
        graph.dispose();
    });

    it("rebuilds when a structural material flag flips", () => {
        const graph = new Canvas3DGraph(three);

        const first = sync(graph, (g3) => g3.box({ fill: "red" }));
        const before = (first.scene.children[0] as never as { material: { uuid: string } }).material.uuid;

        // `side` changes the compiled program, so it can't be mutated.
        const second = sync(graph, (g3) => g3.box({ fill: "red", faces: "both" }));
        const after = (second.scene.children[0] as never as { material: { uuid: string } }).material.uuid;

        expect(after).not.toBe(before);
        graph.dispose();
    });

    it("rebuilds when a slot changes op kind, rather than mutating the wrong type", () => {
        const graph = new Canvas3DGraph(three);

        sync(graph, (g3) => g3.box());
        const { scene } = syncScene(graph, (s) => s.light({ type: "ambient" }));

        // The mesh is gone, not reinterpreted as a light.
        expect(scene.children).toHaveLength(1);
        expect(scene.children[0].type).toBe("AmbientLight");
        graph.dispose();
    });

    it("removes and disposes an op that disappears", () => {
        const graph = new Canvas3DGraph(three);

        const first = sync(graph, (g3) => g3.box().sphere());
        expect(first.scene.children).toHaveLength(2);
        const orphan = (first.scene.children[1] as never as { geometry: { addEventListener?: Function } }).geometry;
        let disposed = false;
        orphan.addEventListener?.("dispose", () => { disposed = true; });

        const second = sync(graph, (g3) => g3.box());
        expect(second.scene.children).toHaveLength(1);
        expect(disposed).toBe(true);
        graph.dispose();
    });

    // The old positional identity meant an op inserted ahead of others shifted
    // their cache slots and rebuilt them, and the opt-out was an author-written
    // `key`. Identity is derived from content now, so there is nothing to write:
    // the box finds its own entry whatever appears before it.
    it("keeps identity across a conditional insert, with no key written", () => {
        const graph = new Canvas3DGraph(three);

        const first = sync(graph, (g3) => g3.box({ width: 2 }));
        const uuid = first.scene.children[0].uuid;

        // A sphere now precedes the box, shifting its structural index from 0 to 1.
        const second = sync(graph, (g3) => g3.sphere().box({ width: 2 }));

        expect(second.scene.children.find((c) => c.uuid === uuid)).toBeDefined();
        graph.dispose();
    });

    // The other half of content keying: two *interchangeable* ops share a bucket
    // and are told apart by their order within it, so a scene of identical boxes
    // still gets one stable cache entry each.
    it("gives identical siblings their own stable entries", () => {
        const graph = new Canvas3DGraph(three);

        const first = sync(graph, (g3) => g3
            .box({ width: 1, position: [0, 0, 0] })
            .box({ width: 1, position: [2, 0, 0] }));
        const uuids = first.scene.children.map((c) => c.uuid);
        expect(new Set(uuids).size).toBe(2);

        const second = sync(graph, (g3) => g3
            .box({ width: 1, position: [0, 1, 0] })
            .box({ width: 1, position: [2, 1, 0] }));

        expect(second.scene.children.map((c) => c.uuid)).toEqual(uuids);
        graph.dispose();
    });

    it("re-uploads a dynamic buffer geometry's contents without reallocating", () => {
        const graph = new Canvas3DGraph(three);
        // One array reused across frames and mutated in place — the fast path for an
        // animated mesh, and invisible to identity comparison.
        const position = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);

        type Geo3 = { uuid: string; getAttribute(n: string): { array: Float32Array } };

        const first = sync(graph, (g3) => g3.mesh(Geo.buffer({ position }), Mat.basic()));
        const uuid = (first.scene.children[0] as never as { geometry: Geo3 }).geometry.uuid;

        position[3] = 5;
        const second = sync(graph, (g3) => g3.mesh(Geo.buffer({ position }), Mat.basic()));
        const after = (second.scene.children[0] as never as { geometry: Geo3 }).geometry;

        expect(after.uuid).toBe(uuid);                       // not reallocated
        expect(after.getAttribute("position").array[3]).toBe(5);
        graph.dispose();
    });

    it("reallocates when a dynamic buffer's length changes", () => {
        const graph = new Canvas3DGraph(three);

        const first = sync(graph, (g3) => g3.mesh(Geo.buffer({ position: new Float32Array(9) }), Mat.basic()));
        const before = (first.scene.children[0] as never as { geometry: { uuid: string } }).geometry.uuid;

        const second = sync(graph, (g3) => g3.mesh(Geo.buffer({ position: new Float32Array(18) }), Mat.basic()));
        const after = (second.scene.children[0] as never as { geometry: { uuid: string } }).geometry.uuid;

        expect(after).not.toBe(before);
        graph.dispose();
    });

    it("evaluates a parametric geometry into a vertex grid", () => {
        const graph = new Canvas3DGraph(three);
        const { scene } = sync(graph, (g3) => g3.mesh(
            Geo.parametric({ segments: 4, vertex: (u, v) => ({ x: u, y: 0, z: v }), computeNormals: true }),
            Mat.basic(),
        ));

        const geometry = (scene.children[0] as never as { geometry: { getAttribute(n: string): { count: number } } }).geometry;
        expect(geometry.getAttribute("position").count).toBe(25);   // (4+1)^2
        expect(geometry.getAttribute("normal")).toBeDefined();      // derived
        graph.dispose();
    });

    it("swaps the camera type and frames it to the given aspect", () => {
        const graph = new Canvas3DGraph(three);

        const perspective = syncScene(graph, (s) => s.draw(new Graphics3D().box()).perspective({ fov: 60 }));
        expect((perspective.camera as never as { isPerspectiveCamera?: boolean }).isPerspectiveCamera).toBe(true);
        expect((perspective.camera as never as { aspect: number }).aspect).toBeCloseTo(800 / 600, 5);

        const ortho = syncScene(graph, (s) => s.draw(new Graphics3D().box()).orthographic({ frustumHeight: 10 }));
        expect((ortho.camera as never as { isOrthographicCamera?: boolean }).isOrthographicCamera).toBe(true);
        graph.dispose();
    });

    it("supplies a default camera when the scene declares none", () => {
        const graph = new Canvas3DGraph(three);
        const { camera } = sync(graph, (g3) => g3.box());

        // A bare `g3.box()` must render something rather than a black frame.
        expect(camera.position.z).toBeGreaterThan(0);
        graph.dispose();
    });

    // Fog is a scene singleton; the background is *not* one at all any more.
    // What is drawn behind a 3D scene is the viewport's own 2D fill — nothing in
    // the 3D pass could tint `scene.background`, and the renderer clears
    // transparent — so the only thing that still writes it is a sky, which comes
    // with the environment that lights the scene.
    it("applies fog as a scene singleton, and clears it", () => {
        const graph = new Canvas3DGraph(three);

        const withSettings = syncScene(graph, (s) => s.draw(new Graphics3D().box())
            .fog({ color: "#102030", near: 2, far: 20 }));
        expect((withSettings.scene.fog as never as { near: number }).near).toBe(2);
        // Transparent by construction: the 2D fill shows through.
        expect(withSettings.scene.background).toBeNull();

        const cleared = syncScene(graph, (s) => s.draw(new Graphics3D().box()).fog(null));
        expect(cleared.scene.fog).toBeNull();
        graph.dispose();
    });

    // Exponential fog is chosen by setting `density`, not by a discriminant that
    // could disagree with the fields beside it.
    it("picks exponential fog from the presence of density", () => {
        const graph = new Canvas3DGraph(three);
        const { scene } = syncScene(graph, (s) => s.draw(new Graphics3D().box())
            .fog({ color: "#102030", density: 0.08 }));

        expect(scene.fog?.constructor.name).toBe("FogExp2");
        expect((scene.fog as never as { density: number }).density).toBeCloseTo(0.08);
        graph.dispose();
    });

    it("writes per-instance matrices into an InstancedMesh", () => {
        const graph = new Canvas3DGraph(three);
        const { scene } = sync(graph, (g3) => g3.instances(
            Geo.box(), Mat.standard(),
            [{ position: [0, 0, 0] }, { position: [3, 0, 0] }],
        ));

        const mesh = scene.children[0] as never as { count: number; isInstancedMesh?: boolean };
        expect(mesh.isInstancedMesh).toBe(true);
        expect(mesh.count).toBe(2);
        graph.dispose();
    });

    it("rebuilds an InstancedMesh when the instance count changes", () => {
        const graph = new Canvas3DGraph(three);
        const build = (n: number) => (g3: Graphics3D) => g3.instances(
            Geo.box(), Mat.standard(),
            Array.from({ length: n }, (_, i) => ({ position: [i, 0, 0] as [number, number, number] })),
        );

        const first = sync(graph, build(2));
        const before = first.scene.children[0].uuid;
        const second = sync(graph, build(5));

        // The count is fixed at construction, so it can't be mutated.
        expect(second.scene.children[0].uuid).not.toBe(before);
        expect((second.scene.children[0] as never as { count: number }).count).toBe(5);
        graph.dispose();
    });

    it("picks the three class from a line's mode", () => {
        const graph = new Canvas3DGraph(three);
        const points = [[0, 0, 0], [1, 1, 1], [2, 0, 0]] as [number, number, number][];

        expect(sync(graph, (g3) => g3.line({ points })).scene.children[0].type).toBe("Line");
        expect(sync(graph, (g3) => g3.line({ points, segments: true })).scene.children[0].type).toBe("LineSegments");
        expect(sync(graph, (g3) => g3.line({ points, closed: true })).scene.children[0].type).toBe("LineLoop");
        graph.dispose();
    });

    it("derives an edges geometry from another geometry", () => {
        const graph = new Canvas3DGraph(three);
        const { scene } = sync(graph, (g3) => g3.line({
            geometry: Geo.edges(Geo.box({ width: 2, height: 2, depth: 2 })),
            segments: true,
        }));

        // A cube has 12 edges → 24 endpoints.
        const geometry = (scene.children[0] as never as { geometry: { getAttribute(n: string): { count: number } } }).geometry;
        expect(geometry.getAttribute("position").count).toBe(24);
        graph.dispose();
    });

    it("converts author-facing degrees into radians", () => {
        const graph = new Canvas3DGraph(three);
        const { scene } = sync(graph, (g3) => g3.box({ rotation: [0, 180, 0] }));

        expect(scene.children[0].rotation.y).toBeCloseTo(Math.PI, 6);
        graph.dispose();
    });

    it("frees every object on dispose", () => {
        const graph = new Canvas3DGraph(three);
        const { scene } = syncScene(graph, (s) => s.draw(new Graphics3D().box().sphere()).light({ type: "ambient" }));
        expect(scene.children.length).toBeGreaterThan(0);

        graph.dispose();
        expect(scene.children).toHaveLength(0);
    });
});

/**
 * `Tex.surface(...)` maps: pixels come from 2D content rasterized this frame and
 * handed in via `setRasters`, keyed by descriptor identity rather than by name.
 * Nothing here needs a CanvasKit surface — `RasterizedSurface` is a plain byte
 * buffer — so the whole resolution path is testable directly.
 */
describe("surface textures", () => {
    /** A distinguishable solid-colour buffer. */
    function raster(size: number, value: number): RasterizedSurface {
        return { pixels: new Uint8Array(size * size * 4).fill(value), width: size, height: size };
    }

    function materialOf(scene: THREE.Scene, index = 0): THREE.MeshBasicMaterial {
        return (scene.children[index] as THREE.Mesh).material as THREE.MeshBasicMaterial;
    }

    /** The resolver only ever compares descriptor identity, never the source. */
    const source = () => new Graphics2D();

    it("resolves a surface map from the frame's buffers", () => {
        const graph = new Canvas3DGraph(three);
        const resolver = new TextureResolver(three, assets);
        const tex = Tex.surface(source(), { width: 2, height: 2 });
        resolver.setRasters("node-a#0", new Map([[tex, raster(2, 200)]]));

        const g3 = new Graphics3D().plane({ unlit: true, fill: tex });
        const { scene } = graph.sync(new Scene3D().draw(g3), 800, 600, resolver);

        const map = materialOf(scene).map!;
        expect(map).toBeTruthy();
        expect(map.image.width).toBe(2);
        // Top-down bytes sampled bottom-up, exactly like an asset image texture.
        expect(map.flipY).toBe(true);
        graph.dispose();
    });

    // The material renders without the map rather than failing — same contract an
    // image texture has while its pixels are still decoding.
    it("resolves to null when the surface has not been rasterized", () => {
        const graph = new Canvas3DGraph(three);
        const resolver = new TextureResolver(three, assets);
        resolver.setRasters("node-a#0", new Map());

        const g3 = new Graphics3D().plane({ unlit: true, fill: Tex.surface(source(), { width: 2, height: 2 }) });
        const { scene } = graph.sync(new Scene3D().draw(g3), 800, 600, resolver);

        expect(materialOf(scene).map).toBeNull();
        graph.dispose();
    });

    // Re-rasterized every frame, so the buffer is reused and the pixels re-upload
    // in place — no per-frame allocation, no stale first frame.
    it("re-uploads into the same texture across frames", () => {
        const graph = new Canvas3DGraph(three);
        const resolver = new TextureResolver(three, assets);
        const tex = Tex.surface(source(), { width: 2, height: 2 });
        const build = () => new Graphics3D().plane({ unlit: true, fill: tex });

        resolver.setRasters("node-a#0", new Map([[tex, raster(2, 10)]]));
        const first = materialOf(graph.sync(new Scene3D().draw(build()), 800, 600, resolver).scene).map!;

        resolver.setRasters("node-a#0", new Map([[tex, raster(2, 250)]]));
        const second = materialOf(graph.sync(new Scene3D().draw(build()), 800, 600, resolver).scene).map!;

        expect(second).toBe(first);
        expect((second.image.data as Uint8Array)[0]).toBe(250);
        graph.dispose();
    });

    // The texture cache is global, so two 3D fills — even two on the *same* node,
    // which a fill cross-fade produces — must not share one texture.
    it("scopes a surface to its owning fill slot", () => {
        const graph = new Canvas3DGraph(three);
        const resolver = new TextureResolver(three, assets);
        const tex = Tex.surface(source(), { width: 2, height: 2 });
        const build = () => new Graphics3D().plane({ unlit: true, fill: tex });

        resolver.setRasters("node-a#0", new Map([[tex, raster(2, 10)]]));
        const a = materialOf(graph.sync(new Scene3D().draw(build()), 800, 600, resolver).scene).map!;

        resolver.setRasters("node-a#1", new Map([[tex, raster(4, 250)]]));
        const b = materialOf(graph.sync(new Scene3D().draw(build()), 800, 600, resolver).scene).map!;

        expect(b).not.toBe(a);
        expect(a.image.width).toBe(2);
        expect(b.image.width).toBe(4);
        graph.dispose();
    });

    // Two structurally identical descriptors are still two textures: the source is
    // a live object, so identity is all that can distinguish them.
    it("keeps two distinct descriptors on separate textures", () => {
        const graph = new Canvas3DGraph(three);
        const resolver = new TextureResolver(three, assets);
        const left = Tex.surface(source(), { width: 2, height: 2 });
        const right = Tex.surface(source(), { width: 4, height: 4 });

        resolver.setRasters("node-a#0", new Map([[left, raster(2, 10)], [right, raster(4, 250)]]));
        const { scene } = graph.sync(
            new Scene3D().draw(
                new Graphics3D().plane({ unlit: true, fill: left }).plane({ unlit: true, fill: right }),
            ),
            800, 600, resolver,
        );

        expect(materialOf(scene, 0).map!.image.width).toBe(2);
        expect(materialOf(scene, 1).map!.image.width).toBe(4);
        graph.dispose();
    });
});
