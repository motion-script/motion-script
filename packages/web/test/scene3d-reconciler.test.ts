import { describe, it, expect, beforeAll } from "vitest";
import type * as THREE from "three";
import { Geo, Graphics3D, Mat, Tex, type RasterizedSurface } from "@motion-script/core";
import { loadScene3D, threeModule } from "../src/three/bridge";
import { Scene3DGraph } from "../src/three/reconciler";
import { TextureResolver, type Scene3DAssets } from "../src/three/handlers/texture";
import type { ThreeModule } from "../src/three/bridge";

/**
 * The reconciler needs no CanvasKit surface and no WebGL context — `sync()` only
 * builds and mutates a `THREE.Scene`. So the mutate-vs-rebuild behaviour that all
 * the 3D performance rests on can be tested directly.
 */
let three: ThreeModule;
let textures: TextureResolver;

/** No assets: texture-less descriptors never reach the resolver. */
const assets: Scene3DAssets = {
    getImagePixels: () => null,
    release3DTexture: () => { },
};

beforeAll(async () => {
    await loadScene3D();
    three = threeModule()!;
    textures = new TextureResolver(three, assets);
});

/** Reconcile a freshly-built Graphics3D into `graph`. */
function sync(graph: Scene3DGraph, build: (g: Graphics3D) => unknown) {
    const g = new Graphics3D();
    build(g);
    return graph.sync(g, 800, 600, textures);
}

describe("Scene3DGraph reconciliation", () => {
    it("builds the described object graph", () => {
        const graph = new Scene3DGraph(three);
        const { scene } = sync(graph, (g) => g.box().ambient());

        expect(scene.children).toHaveLength(2);
        expect(scene.children[0].type).toBe("Mesh");
        expect(scene.children[1].type).toBe("AmbientLight");
        graph.dispose();
    });

    it("nests group() children under a Group", () => {
        const graph = new Scene3DGraph(three);
        const { scene } = sync(graph, (g) => g.box().group({ position: [1, 0, 0] }, (i) => i.sphere().sphere()));

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
        const graph = new Scene3DGraph(three);

        const first = sync(graph, (g) => g.box({ width: 2, color: "red" }));
        const mesh1 = first.scene.children[0] as never as { uuid: string; geometry: { uuid: string }; material: { uuid: string } };
        const ids = { object: mesh1.uuid, geometry: mesh1.geometry.uuid, material: mesh1.material.uuid };

        const second = sync(graph, (g) => g.box({ width: 2, color: "red" }));
        const mesh2 = second.scene.children[0] as never as typeof mesh1;

        expect(mesh2.uuid).toBe(ids.object);
        expect(mesh2.geometry.uuid).toBe(ids.geometry);
        expect(mesh2.material.uuid).toBe(ids.material);
        graph.dispose();
    });

    it("writes a changed transform in place, without rebuilding", () => {
        const graph = new Scene3DGraph(three);

        const first = sync(graph, (g) => g.box({ position: [0, 0, 0] }));
        const uuid = first.scene.children[0].uuid;

        const second = sync(graph, (g) => g.box({ position: [5, 1, 2] }));
        expect(second.scene.children[0].uuid).toBe(uuid);
        expect(second.scene.children[0].position.toArray()).toEqual([5, 1, 2]);
        graph.dispose();
    });

    it("writes a changed material colour in place, without recompiling", () => {
        const graph = new Scene3DGraph(three);

        const first = sync(graph, (g) => g.box({ color: "red" }));
        const material1 = (first.scene.children[0] as never as { material: { uuid: string } }).material;
        const uuid = material1.uuid;

        const second = sync(graph, (g) => g.box({ color: "blue" }));
        const material2 = (second.scene.children[0] as never as { material: { uuid: string; color: { b: number } } }).material;

        // Same material object — a colour tween must never recompile the program.
        expect(material2.uuid).toBe(uuid);
        expect(material2.color.b).toBeGreaterThan(0.5);
        graph.dispose();
    });

    // three geometries are immutable, so a parameter change *must* rebuild — this
    // is the expensive case the docs steer authors away from.
    it("rebuilds geometry when a parameter changes, and disposes the old one", () => {
        const graph = new Scene3DGraph(three);

        const first = sync(graph, (g) => g.box({ width: 2 }));
        const old = (first.scene.children[0] as never as { geometry: { uuid: string } }).geometry;
        let disposed = false;
        old.addEventListener?.("dispose", () => { disposed = true; });

        const second = sync(graph, (g) => g.box({ width: 4 }));
        const next = (second.scene.children[0] as never as { geometry: { uuid: string } }).geometry;

        expect(next.uuid).not.toBe(old.uuid);
        expect(disposed).toBe(true);
        graph.dispose();
    });

    it("rebuilds when a structural material flag flips", () => {
        const graph = new Scene3DGraph(three);

        const first = sync(graph, (g) => g.box({ color: "red" }));
        const before = (first.scene.children[0] as never as { material: { uuid: string } }).material.uuid;

        // `side` changes the compiled program, so it can't be mutated.
        const second = sync(graph, (g) => g.box({ color: "red", side: "double" }));
        const after = (second.scene.children[0] as never as { material: { uuid: string } }).material.uuid;

        expect(after).not.toBe(before);
        graph.dispose();
    });

    it("rebuilds when a slot changes op kind, rather than mutating the wrong type", () => {
        const graph = new Scene3DGraph(three);

        sync(graph, (g) => g.box());
        const { scene } = sync(graph, (g) => g.ambient());

        // The mesh is gone, not reinterpreted as a light.
        expect(scene.children).toHaveLength(1);
        expect(scene.children[0].type).toBe("AmbientLight");
        graph.dispose();
    });

    it("removes and disposes an op that disappears", () => {
        const graph = new Scene3DGraph(three);

        const first = sync(graph, (g) => g.box().sphere());
        expect(first.scene.children).toHaveLength(2);
        const orphan = (first.scene.children[1] as never as { geometry: { addEventListener?: Function } }).geometry;
        let disposed = false;
        orphan.addEventListener?.("dispose", () => { disposed = true; });

        const second = sync(graph, (g) => g.box());
        expect(second.scene.children).toHaveLength(1);
        expect(disposed).toBe(true);
        graph.dispose();
    });

    // Without an explicit key, index-based identity means an op inserted ahead of
    // others shifts their slots. `key` is the documented opt-out.
    it("keeps identity across a conditional insert when given an explicit key", () => {
        const graph = new Scene3DGraph(three);

        const first = sync(graph, (g) => g.box({ key: "hero", width: 2 }));
        const uuid = first.scene.children[0].uuid;

        // A sphere now precedes the box, shifting its structural index from 0 to 1.
        const second = sync(graph, (g) => g.sphere().box({ key: "hero", width: 2 }));
        const hero = second.scene.children.find((c) => c.uuid === uuid);

        expect(hero).toBeDefined();
        graph.dispose();
    });

    it("re-uploads a dynamic buffer geometry's contents without reallocating", () => {
        const graph = new Scene3DGraph(three);
        // One array reused across frames and mutated in place — the fast path for an
        // animated mesh, and invisible to identity comparison.
        const position = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);

        type Geo3 = { uuid: string; getAttribute(n: string): { array: Float32Array } };

        const first = sync(graph, (g) => g.mesh(Geo.buffer({ position }), Mat.basic()));
        const uuid = (first.scene.children[0] as never as { geometry: Geo3 }).geometry.uuid;

        position[3] = 5;
        const second = sync(graph, (g) => g.mesh(Geo.buffer({ position }), Mat.basic()));
        const after = (second.scene.children[0] as never as { geometry: Geo3 }).geometry;

        expect(after.uuid).toBe(uuid);                       // not reallocated
        expect(after.getAttribute("position").array[3]).toBe(5);
        graph.dispose();
    });

    it("reallocates when a dynamic buffer's length changes", () => {
        const graph = new Scene3DGraph(three);

        const first = sync(graph, (g) => g.mesh(Geo.buffer({ position: new Float32Array(9) }), Mat.basic()));
        const before = (first.scene.children[0] as never as { geometry: { uuid: string } }).geometry.uuid;

        const second = sync(graph, (g) => g.mesh(Geo.buffer({ position: new Float32Array(18) }), Mat.basic()));
        const after = (second.scene.children[0] as never as { geometry: { uuid: string } }).geometry.uuid;

        expect(after).not.toBe(before);
        graph.dispose();
    });

    it("evaluates a parametric geometry into a vertex grid", () => {
        const graph = new Scene3DGraph(three);
        const { scene } = sync(graph, (g) => g.mesh(
            Geo.parametric({ segments: 4, vertex: (u, v) => ({ x: u, y: 0, z: v }), computeNormals: true }),
            Mat.basic(),
        ));

        const geometry = (scene.children[0] as never as { geometry: { getAttribute(n: string): { count: number } } }).geometry;
        expect(geometry.getAttribute("position").count).toBe(25);   // (4+1)^2
        expect(geometry.getAttribute("normal")).toBeDefined();      // derived
        graph.dispose();
    });

    it("swaps the camera type and frames it to the given aspect", () => {
        const graph = new Scene3DGraph(three);

        const perspective = sync(graph, (g) => g.box().perspective({ fov: 60 }));
        expect((perspective.camera as never as { isPerspectiveCamera?: boolean }).isPerspectiveCamera).toBe(true);
        expect((perspective.camera as never as { aspect: number }).aspect).toBeCloseTo(800 / 600, 5);

        const ortho = sync(graph, (g) => g.box().orthographic({ frustumHeight: 10 }));
        expect((ortho.camera as never as { isOrthographicCamera?: boolean }).isOrthographicCamera).toBe(true);
        graph.dispose();
    });

    it("supplies a default camera when the scene declares none", () => {
        const graph = new Scene3DGraph(three);
        const { camera } = sync(graph, (g) => g.box());

        // A bare `g.box()` must render something rather than a black frame.
        expect(camera.position.z).toBeGreaterThan(0);
        graph.dispose();
    });

    it("applies fog and background as scene singletons, and clears them", () => {
        const graph = new Scene3DGraph(three);

        const withSettings = sync(graph, (g) => g.box()
            .fog({ type: "linear", color: "#102030", near: 2, far: 20 })
            .background("#010203"));
        expect((withSettings.scene.fog as never as { near: number }).near).toBe(2);
        expect(withSettings.scene.background).not.toBeNull();

        const cleared = sync(graph, (g) => g.box().fog(null).background(null));
        expect(cleared.scene.fog).toBeNull();
        expect(cleared.scene.background).toBeNull();
        graph.dispose();
    });

    it("writes per-instance matrices into an InstancedMesh", () => {
        const graph = new Scene3DGraph(three);
        const { scene } = sync(graph, (g) => g.instances(
            Geo.box(), Mat.standard(),
            [{ position: [0, 0, 0] }, { position: [3, 0, 0] }],
        ));

        const mesh = scene.children[0] as never as { count: number; isInstancedMesh?: boolean };
        expect(mesh.isInstancedMesh).toBe(true);
        expect(mesh.count).toBe(2);
        graph.dispose();
    });

    it("rebuilds an InstancedMesh when the instance count changes", () => {
        const graph = new Scene3DGraph(three);
        const build = (n: number) => (g: Graphics3D) => g.instances(
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
        const graph = new Scene3DGraph(three);
        const points = [[0, 0, 0], [1, 1, 1], [2, 0, 0]] as [number, number, number][];

        expect(sync(graph, (g) => g.line({ points })).scene.children[0].type).toBe("Line");
        expect(sync(graph, (g) => g.line({ points, mode: "segments" })).scene.children[0].type).toBe("LineSegments");
        expect(sync(graph, (g) => g.line({ points, mode: "loop" })).scene.children[0].type).toBe("LineLoop");
        graph.dispose();
    });

    it("derives an edges geometry from another geometry", () => {
        const graph = new Scene3DGraph(three);
        const { scene } = sync(graph, (g) => g.line({
            geometry: Geo.edges(Geo.box({ width: 2, height: 2, depth: 2 })),
            mode: "segments",
        }));

        // A cube has 12 edges → 24 endpoints.
        const geometry = (scene.children[0] as never as { geometry: { getAttribute(n: string): { count: number } } }).geometry;
        expect(geometry.getAttribute("position").count).toBe(24);
        graph.dispose();
    });

    it("converts author-facing degrees into radians", () => {
        const graph = new Scene3DGraph(three);
        const { scene } = sync(graph, (g) => g.box({ rotation: [0, 180, 0] }));

        expect(scene.children[0].rotation.y).toBeCloseTo(Math.PI, 6);
        graph.dispose();
    });

    it("frees every object on dispose", () => {
        const graph = new Scene3DGraph(three);
        const { scene } = sync(graph, (g) => g.box().sphere().ambient());
        expect(scene.children.length).toBeGreaterThan(0);

        graph.dispose();
        expect(scene.children).toHaveLength(0);
    });
});

/**
 * `Tex.surface(...)` maps: pixels come from the `Surface2D` buffers `Scene3D`
 * rasterized this frame, handed in via `setSurfaces` rather than the asset
 * pipeline. Nothing here needs a CanvasKit surface — `RasterizedSurface` is a
 * plain byte buffer — so the whole resolution path is testable directly.
 */
describe("surface textures", () => {
    /** A distinguishable solid-colour buffer. */
    function raster(size: number, value: number): RasterizedSurface {
        return { pixels: new Uint8Array(size * size * 4).fill(value), width: size, height: size };
    }

    function materialOf(scene: THREE.Scene, index = 0): THREE.MeshBasicMaterial {
        return (scene.children[index] as THREE.Mesh).material as THREE.MeshBasicMaterial;
    }

    it("resolves a surface map from the frame's buffers", () => {
        const graph = new Scene3DGraph(three);
        const resolver = new TextureResolver(three, assets);
        resolver.setSurfaces("node-a", new Map([["screen", raster(2, 200)]]));

        const g = new Graphics3D().plane({ unlit: true, map: Tex.surface("screen") });
        const { scene } = graph.sync(g, 800, 600, resolver);

        const map = materialOf(scene).map!;
        expect(map).toBeTruthy();
        expect(map.image.width).toBe(2);
        // Top-down bytes sampled bottom-up, exactly like an asset image texture.
        expect(map.flipY).toBe(true);
        graph.dispose();
    });

    // The material renders without the map rather than failing — same contract an
    // image texture has while its pixels are still decoding.
    it("resolves to null when the named surface is absent", () => {
        const graph = new Scene3DGraph(three);
        const resolver = new TextureResolver(three, assets);
        resolver.setSurfaces("node-a", new Map());

        const g = new Graphics3D().plane({ unlit: true, map: Tex.surface("missing") });
        const { scene } = graph.sync(g, 800, 600, resolver);

        expect(materialOf(scene).map).toBeNull();
        graph.dispose();
    });

    // Re-rasterized every frame, so the buffer is reused and the pixels re-upload
    // in place — no per-frame allocation, no stale first frame.
    it("re-uploads into the same texture across frames", () => {
        const graph = new Scene3DGraph(three);
        const resolver = new TextureResolver(three, assets);

        resolver.setSurfaces("node-a", new Map([["screen", raster(2, 10)]]));
        const build = () => new Graphics3D().plane({ unlit: true, map: Tex.surface("screen") });
        const first = materialOf(graph.sync(build(), 800, 600, resolver).scene).map!;

        resolver.setSurfaces("node-a", new Map([["screen", raster(2, 250)]]));
        const second = materialOf(graph.sync(build(), 800, 600, resolver).scene).map!;

        expect(second).toBe(first);
        expect((second.image.data as Uint8Array)[0]).toBe(250);
        graph.dispose();
    });

    // Surface names are only unique within one Scene3D, and the texture cache is
    // global — so two viewports each owning a `name="screen"` must not share one.
    it("scopes a surface name to its owning node", () => {
        const graph = new Scene3DGraph(three);
        const resolver = new TextureResolver(three, assets);
        const build = () => new Graphics3D().plane({ unlit: true, map: Tex.surface("screen") });

        resolver.setSurfaces("node-a", new Map([["screen", raster(2, 10)]]));
        const a = materialOf(graph.sync(build(), 800, 600, resolver).scene).map!;

        resolver.setSurfaces("node-b", new Map([["screen", raster(4, 250)]]));
        const b = materialOf(graph.sync(build(), 800, 600, resolver).scene).map!;

        expect(b).not.toBe(a);
        expect(a.image.width).toBe(2);
        expect(b.image.width).toBe(4);
        graph.dispose();
    });
});
