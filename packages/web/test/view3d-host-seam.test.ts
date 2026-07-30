import { describe, it, expect, afterEach } from "vitest";
import {
    view3DBackend,
    view3DRendererHost,
    registerView3DRendererHost,
    disposeView3DBackend,
    __resetView3DRendererHostForTests,
    __resetView3DBridgeForTests,
    loadView3D,
    type View3DRendererHost,
    type View3DAssets,
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
 * tree-shaken away. If that happened, `view3DBackend()` would return null
 * forever, the warm-and-retry loop would exhaust its passes, and every frame
 * would ship its 2D parts with no 3D — and no error anywhere. These tests are
 * what turn that into a failing build instead of a silent regression.
 */

const NOOP_ASSETS: View3DAssets = {
    getImagePixels: () => null,
    release3DTexture: () => { },
};

function fakeHost(): View3DRendererHost {
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
        expect(view3DRendererHost()).not.toBeNull();
    });

    it("exposes the five members the backend and reconciler call", async () => {
        await import("../src");
        const host = view3DRendererHost()!;
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
        expect(view3DRendererHost()!.active()).toBeNull();
    });
});

describe("view3DBackend degradation", () => {
    afterEach(() => {
        // The backend is a module singleton that captures the host at construction,
        // so it must be torn down between tests or a later `view3DBackend()` hands
        // back an instance still holding the previous host. That caching is correct
        // in production — the barrel registers before anything can build a backend —
        // but it makes registration order observable here.
        disposeView3DBackend();
        __resetView3DRendererHostForTests();
        __resetView3DBridgeForTests();
    });

    it("returns null when three has loaded but no platform renderer is registered", async () => {
        // A backend with no GL context (a CPU-raster Node renderer, say) registers
        // nothing. That must degrade through the existing "three isn't ready" path
        // rather than throwing mid-frame.
        await loadView3D();
        __resetView3DRendererHostForTests();
        expect(view3DRendererHost()).toBeNull();
        expect(view3DBackend(NOOP_ASSETS)).toBeNull();
    });

    it("returns a backend once both three and a renderer are present", async () => {
        await loadView3D();
        registerView3DRendererHost(fakeHost());
        expect(view3DBackend(NOOP_ASSETS)).not.toBeNull();
    });

    it("routes rendering through the registered host rather than a hard-wired renderer", async () => {
        await loadView3D();
        let renderedKey: string | null = null;
        const host = fakeHost();
        host.render = (_three, key) => {
            renderedKey = key;
            return { source: { marker: "from-the-host" }, width: 8, height: 4 };
        };
        registerView3DRendererHost(host);

        const backend = view3DBackend(NOOP_ASSETS)!;
        const { Graphics3D } = await import("@motion-script/core");
        const g3 = new Graphics3D().perspective({ position: [0, 0, 5], lookAt: 0 }).box({ width: 1 });

        const frame = backend.render("node#0", g3, 8, 4);

        expect(renderedKey).toBe("node#0");
        expect(frame.width).toBe(8);
        expect(frame.height).toBe(4);
        expect(frame.source).toEqual({ marker: "from-the-host" });
    });

    it("frees the host's per-slot buffer when a slot is swept", async () => {
        await loadView3D();
        const forgotten: string[] = [];
        const released: string[] = [];
        const host = fakeHost();
        host.forgetBuffer = (key) => { forgotten.push(key); };
        registerView3DRendererHost(host);

        const backend = view3DBackend({
            getImagePixels: () => null,
            release3DTexture: (key) => { released.push(key); },
        })!;
        const { Graphics3D } = await import("@motion-script/core");
        const g3 = new Graphics3D().perspective({ position: [0, 0, 5], lookAt: 0 }).box({ width: 1 });

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
