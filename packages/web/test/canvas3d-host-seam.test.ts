import { describe, it, expect, afterEach } from "vitest";
import {
    canvas3DBackend,
    canvas3DRendererHost,
    registerCanvas3DRendererHost,
    disposeCanvas3DBackend,
    __resetView3DRendererHostForTests,
    __resetCanvas3DBridgeForTests,
    loadCanvas3D,
    type Canvas3DRendererHost,
    type Canvas3DAssets,
} from "@motion-script/skia-render";

/**
 * The 3D renderer seam, which has no other coverage and whose failure mode is
 * silent.
 *
 * The reconciler, backend and lazy `three` boundary live in
 * `@motion-script/skia-render`; only the `WebGLRenderer` that rasterizes their
 * output lives here. skia-render cannot import this package (that would be a
 * package cycle), so the renderer is *registered* instead.
 *
 * Registration happens from `@motion-script/web`'s barrel rather than from
 * `src/three/renderer.ts`, and that placement is load-bearing: nothing in this
 * package statically imports that module any more, and the package declares
 * `sideEffects: false`, so a module-scope registration inside it could be
 * tree-shaken away. If that happened, `canvas3DBackend()` would return null
 * forever, the warm-and-retry loop would exhaust its passes, and every frame
 * would ship its 2D parts with no 3D — and no error anywhere. These tests are
 * what turn that into a failing build instead of a silent regression.
 */

const NOOP_ASSETS: Canvas3DAssets = {
    getImagePixels: () => null,
    release3DTexture: () => { },
};

function fakeHost(): Canvas3DRendererHost {
    return {
        render: () => ({ source: {}, width: 1, height: 1 }),
        applySettings: () => { },
        active: () => null,
        forgetBuffer: () => { },
        dispose: () => { },
    };
}

describe("the 3D renderer seam", () => {
    it("is registered as a side effect of importing @motion-script/web", async () => {
        // The real assertion of this file. Importing the barrel must install the
        // host — that is the whole contract, and it is what a tree-shaken
        // registration would break.
        await import("../src");
        expect(canvas3DRendererHost()).not.toBeNull();
    });

    it("exposes the five members the backend and reconciler call", async () => {
        await import("../src");
        const host = canvas3DRendererHost()!;
        expect(typeof host.render).toBe("function");
        expect(typeof host.applySettings).toBe("function");
        expect(typeof host.active).toBe("function");
        expect(typeof host.forgetBuffer).toBe("function");
        expect(typeof host.dispose).toBe("function");
    });

    it("reports no live renderer before anything has been rendered", async () => {
        await import("../src");
        // `active()` feeds PMREMGenerator for environment maps; null is the correct
        // answer before first use, and the reconciler must tolerate it.
        expect(canvas3DRendererHost()!.active()).toBeNull();
    });
});

describe("canvas3DBackend degradation", () => {
    afterEach(() => {
        // The backend is a module singleton that captures the host at construction,
        // so it must be torn down between tests or a later `canvas3DBackend()` hands
        // back an instance still holding the previous host. That caching is correct
        // in production — the barrel registers before anything can build a backend —
        // but it makes registration order observable here.
        disposeCanvas3DBackend();
        __resetView3DRendererHostForTests();
        __resetCanvas3DBridgeForTests();
    });

    it("returns null when three has loaded but no platform renderer is registered", async () => {
        // A backend with no GL context (a CPU-raster Node renderer, say) registers
        // nothing. That must degrade through the existing "three isn't ready" path
        // rather than throwing mid-frame.
        await loadCanvas3D();
        __resetView3DRendererHostForTests();
        expect(canvas3DRendererHost()).toBeNull();
        expect(canvas3DBackend(NOOP_ASSETS)).toBeNull();
    });

    it("returns a backend once both three and a renderer are present", async () => {
        await loadCanvas3D();
        registerCanvas3DRendererHost(fakeHost());
        expect(canvas3DBackend(NOOP_ASSETS)).not.toBeNull();
    });

    it("routes rendering through the registered host rather than a hard-wired renderer", async () => {
        await loadCanvas3D();
        let renderedKey: string | null = null;
        const host = fakeHost();
        host.render = (_three, key) => {
            renderedKey = key;
            return { source: { marker: "from-the-host" }, width: 8, height: 4 };
        };
        registerCanvas3DRendererHost(host);

        const backend = canvas3DBackend(NOOP_ASSETS)!;
        const { Graphics3D, Scene3D } = await import("@motion-script/core");
        const g3 = new Scene3D()
            .perspective({ position: [0, 0, 5], lookAt: 0 })
            .draw(new Graphics3D().box({ width: 1 }));

        const frame = backend.render("node#0", g3, 8, 4);

        expect(renderedKey).toBe("node#0");
        expect(frame.width).toBe(8);
        expect(frame.height).toBe(4);
        expect(frame.source).toEqual({ marker: "from-the-host" });
    });

    it("frees the host's per-slot buffer when a slot is swept", async () => {
        await loadCanvas3D();
        const forgotten: string[] = [];
        const released: string[] = [];
        const host = fakeHost();
        host.forgetBuffer = (key) => { forgotten.push(key); };
        registerCanvas3DRendererHost(host);

        const backend = canvas3DBackend({
            getImagePixels: () => null,
            release3DTexture: (key) => { released.push(key); },
        })!;
        const { Graphics3D, Scene3D } = await import("@motion-script/core");
        const g3 = new Scene3D()
            .perspective({ position: [0, 0, 5], lookAt: 0 })
            .draw(new Graphics3D().box({ width: 1 }));

        backend.beginFrame();
        backend.render("node#0", g3, 8, 4);
        // A pass that doesn't touch the slot must sweep it — and the sweep has to
        // reach *both* the host's buffer bookkeeping and the CK texture, or a
        // removed 3D node keeps pinning GPU memory.
        backend.beginFrame();
        backend.sweep();

        expect(forgotten).toContain("node#0");
        expect(released).toContain("node#0");
    });
});
