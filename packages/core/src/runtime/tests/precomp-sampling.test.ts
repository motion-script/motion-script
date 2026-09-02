import { beforeAll, describe, expect, it } from "vitest";

import { ManifestAssetCatalog } from "@/assets/catalog";
import { Fills } from "@/attributes/shape/fill/chain";
import { registerBuiltins } from "@/document/builtins";
import { createAnimationScene } from "@/document/scene";
import type { AnimationDocument } from "@/document/types";
import type { Scene } from "@/nodes/scene/scene-node";
import { Precomp, type ScenePrecomp } from "@/runtime/precompisition";
import { FakeMeasurer } from "@/runtime/runtime.fixtures";

const FPS = 10;
const VIEWPORT = { width: 200, height: 200 };
const measurer = new FakeMeasurer();

const catalog = () => new ManifestAssetCatalog({
    image: { "pic.png": { src: "pic.png", width: 64, height: 64, sizeBytes: 4096 } },
    video: {},
    audio: {},
    font: {},
});

beforeAll(() => registerBuiltins());

/**
 * A rect whose fill tweens from a colour to an image over `[1s, 2s]`, on a
 * three-second scene. At 10fps that is key times 0/1/2/3 → frames 0/10/20/29.
 *
 * The interesting frame is 10: the tween's *start*, where the fill still holds
 * only the colour. The image belongs to the whole of `[10, 20]` regardless,
 * because `lerpFillArray` cross-fades a non-lerpable pair — both fills are
 * painted from just after frame 10 onward.
 */
function crossFadeDoc(): AnimationDocument {
    return {
        kind: "animation",
        duration: 3,
        commands: [
            {
                id: "add-rect",
                type: "add",
                target: null,
                at: 0,
                params: {
                    node: {
                        id: "card",
                        type: "rect",
                        parent: null,
                        order: 0,
                        props: { width: 100, height: 100, fill: "#ff0000" },
                    },
                },
            },
            {
                id: "swap-fill",
                type: "to",
                target: "card",
                at: 1,
                duration: 1,
                params: { props: { fill: Fills.image("pic.png") } },
            },
        ],
    };
}

function measure(scene: Scene): ScenePrecomp {
    return new Precomp([scene], VIEWPORT, FPS, catalog(), measurer).run().scenes[0];
}

/**
 * The same scene, forced down the frame-by-frame walk.
 *
 * A driver that cannot name its boundaries is the fallback path, and it is what
 * the sampled pass has to be checked against — so rather than write a second
 * document, take the boundaries away from this one.
 */
function unsampled(scene: Scene): Scene {
    Object.defineProperty(scene, "keyTimes", { value: () => null });
    return scene;
}

describe("Precomp – boundary sampling", () => {
    it("walks a scene's key times rather than its frames", () => {
        const scene = createAnimationScene(crossFadeDoc());
        const times = scene.keyTimes();
        // 0, the tween's start and end, and the scene's declared end — four
        // samples in place of thirty frames.
        expect(times).toEqual([0, 1, 2, 3]);
    });

    it("attributes a cross-faded image to the whole interval, not just its end", () => {
        const pass = measure(createAnimationScene(crossFadeDoc()));
        const image = pass.assetRecords.get("pic.png");

        expect(image).toBeDefined();
        // Frame 10 is the tween's start. Endpoint-only attribution would open
        // this decode at frame 20 — after every frame that already painted it.
        expect(image!.startFrame).toBe(10);
        expect(image!.endFrame).toBeGreaterThanOrEqual(20);
    });

    it("declares nothing the frame-by-frame walk would not, and nothing later", () => {
        const sampled = measure(createAnimationScene(crossFadeDoc()));
        const walked = measure(unsampled(createAnimationScene(crossFadeDoc())));

        expect(sampled.frameCount).toBe(walked.frameCount);
        expect([...sampled.assetRecords.keys()].sort())
            .toEqual([...walked.assetRecords.keys()].sort());

        // The sampled window must *contain* the walked one. Early is free — the
        // asset manager simply loads sooner; late is a frame reaching for a
        // decode that is not there.
        for (const [key, want] of walked.assetRecords) {
            const got = sampled.assetRecords.get(key)!;
            expect(got.startFrame).toBeLessThanOrEqual(want.startFrame);
            expect(got.endFrame).toBeGreaterThanOrEqual(want.endFrame);
        }
    });

    it("covers every node's lifespan the frame-by-frame walk found", () => {
        const sampled = measure(createAnimationScene(crossFadeDoc()));
        const walked = measure(unsampled(createAnimationScene(crossFadeDoc())));

        expect([...sampled.lifespans.keys()].sort()).toEqual([...walked.lifespans.keys()].sort());
        for (const [path, want] of walked.lifespans) {
            const got = sampled.lifespans.get(path)!;
            expect(got.startFrame).toBeLessThanOrEqual(want.startFrame);
            expect(got.endFrame).toBeGreaterThanOrEqual(want.endFrame);
        }
    });

    it("narrows a lifespan to the span a node is actually present for", () => {
        const doc = crossFadeDoc();
        doc.commands.push({
            id: "add-late",
            type: "add",
            target: null,
            at: 1,
            params: {
                node: { id: "badge", type: "rect", parent: null, order: 1, props: { width: 10, height: 10 } },
            },
        });
        doc.commands.push({ id: "drop-late", type: "remove", target: "badge", at: 2, params: {} });

        const pass = measure(createAnimationScene(doc));
        // Present on [1s, 2s) — frames 10 through 19, plus at most the boundary
        // frame the interval it leaves on is sampled at.
        const badge = [...pass.lifespans.entries()].find(([path]) => path === "1")?.[1];
        expect(badge).toBeDefined();
        expect(badge!.startFrame).toBe(10);
        expect(badge!.endFrame).toBeLessThanOrEqual(20);
        expect(badge!.endFrame).toBeGreaterThanOrEqual(19);
    });
});
