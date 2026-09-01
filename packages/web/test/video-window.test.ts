import { describe, it, expect, beforeAll, vi } from "vitest";
import type { CanvasKit } from "@motion-script/canvaskit";
import wasmUrl from "@motion-script/canvaskit/canvaskit.wasm?url";
import { ManifestAssetCatalog } from "@motion-script/core";
import { getCanvasKit } from "../src/getter";
import { WebStorageAdapter } from "../src/storage-adapter";

/**
 * The video subsystem's caching, eviction and texture-slot logic.
 *
 * This is the most subtle code in the adapter and it had no coverage at all,
 * which matters because its failure mode is *frame accuracy*: the wrong-but-
 * plausible frame painted for one timestamp. A still screenshot looks fine, so
 * neither the unit suite nor the e2e pixel diff catches it — you notice a video
 * that's one frame stale, or two playheads of one clip wearing each other's
 * frame, only by watching motion.
 *
 * These tests pin the invariants rather than the implementation, so they should
 * survive the storage-adapter split (where the window/eviction/slot policy moves
 * to `SkiaStorageAdapter` and only decode/upload stay platform-specific) and fail
 * if that move changes behaviour.
 *
 * The members under test are private, so they're reached through `as any`. That's
 * deliberate: the alternative is exporting internals purely for tests, and the
 * behaviour here is genuinely internal — what's public (`claimVideoFrame`,
 * `beginRenderPass`) is exercised through its real signature.
 */

const EMPTY_MANIFEST = { image: {}, video: {}, audio: {}, font: {} };

let ck: CanvasKit;

beforeAll(async () => {
    ck = await getCanvasKit(wasmUrl);
});

function makeAdapter(fps = 30): WebStorageAdapter {
    return new WebStorageAdapter(
        ck,
        new ManifestAssetCatalog(EMPTY_MANIFEST as never),
        { width: 1920, height: 1080 },
        fps,
    );
}

/** A stand-in for a decoded frame. `bitmap` only needs a `close()` to be observable. */
function fakeFrame(timestamp: number): { timestamp: number; bitmap: { close: () => void; closed: boolean } } {
    const bitmap = {
        closed: false,
        close() { this.closed = true; },
    };
    return { timestamp, bitmap };
}

/** Build a frame map keyed the way the adapter keys it: quantized timestamp. */
function frameMap(step: number, timestamps: number[]): Map<number, any> {
    const map = new Map<number, any>();
    for (const ts of timestamps) map.set(Math.round(ts / step), fakeFrame(ts));
    return map;
}

describe("quantizeTs", () => {
    it("rounds to the nearest frame index so neighbouring times share a key", () => {
        const a = makeAdapter() as any;
        const step = 1 / 30;
        expect(a.quantizeTs(0, step)).toBe(0);
        expect(a.quantizeTs(step, step)).toBe(1);
        // Just under and just over the midpoint between frames 1 and 2.
        expect(a.quantizeTs(step * 1.49, step)).toBe(1);
        expect(a.quantizeTs(step * 1.51, step)).toBe(2);
    });

    it("is stable for a time already on the grid, at any index", () => {
        const a = makeAdapter() as any;
        const step = 1 / 24;
        for (const i of [0, 1, 37, 1000]) {
            expect(a.quantizeTs(i * step, step)).toBe(i);
        }
    });
});

describe("nearestWithin — the Echo lookup", () => {
    const step = 1 / 30;

    it("matches a decoded sample whose grid-aligned time quantized to an adjacent key", () => {
        const a = makeAdapter() as any;
        // Decoded at 0.100s; asked for 0.105s — well within one step (0.0333s).
        const store = frameMap(step, [0.1]);
        const hit = a.nearestWithin(store, 0.105, step);
        expect(hit?.timestamp).toBeCloseTo(0.1, 6);
    });

    it("refuses a frame further than one step away rather than returning a clearly wrong one", () => {
        const a = makeAdapter() as any;
        const store = frameMap(step, [0.1]);
        // 0.2s is three steps from the only decoded frame.
        expect(a.nearestWithin(store, 0.2, step)).toBeNull();
        // Exactly one step away is still acceptable (boundary is inclusive).
        expect(a.nearestWithin(store, 0.1 + step, step)?.timestamp).toBeCloseTo(0.1, 6);
    });

    it("picks the closest of several candidates", () => {
        const a = makeAdapter() as any;
        const store = frameMap(step, [0.1, 0.2, 0.3]);
        expect(a.nearestWithin(store, 0.205, step)?.timestamp).toBeCloseTo(0.2, 6);
    });

    it("returns null for an absent or empty store", () => {
        const a = makeAdapter() as any;
        expect(a.nearestWithin(undefined, 0.1, step)).toBeNull();
        expect(a.nearestWithin(new Map(), 0.1, step)).toBeNull();
    });
});

describe("nearestDecoded — the playback lookup", () => {
    const step = 1 / 30;

    it("returns the nearest frame at ANY distance, so a cold playhead never blanks", () => {
        const a = makeAdapter() as any;
        const frames = frameMap(step, [5.0]);
        // Contrast with nearestWithin, which refuses this.
        expect(a.nearestDecoded(frames, 0, step)?.timestamp).toBeCloseTo(5.0, 6);
        expect(a.nearestWithin(frames, 0, step)).toBeNull();
    });

    it("prefers the exact key when it is present", () => {
        const a = makeAdapter() as any;
        const frames = frameMap(step, [0.1, 0.2, 0.3]);
        expect(a.nearestDecoded(frames, 0.2, step)?.timestamp).toBeCloseTo(0.2, 6);
    });

    it("returns null only when nothing is decoded", () => {
        const a = makeAdapter() as any;
        expect(a.nearestDecoded(new Map(), 0.1, step)).toBeNull();
    });
});

describe("evictVideoWindow", () => {
    const step = 1 / 30;

    it("keeps the window asymmetric — more ahead than behind", () => {
        // 96 forward vs 32 back is the documented memory/scrub tradeoff. A refactor
        // that symmetrizes it would pass a naive "evicts far frames" test.
        const a = makeAdapter() as any;
        const now = 10;
        const frames = frameMap(step, [
            now - 33 * step,   // just outside the back window  → evicted
            now - 31 * step,   // just inside                   → kept
            now,
            now + 95 * step,   // just inside the forward window → kept
            now + 97 * step,   // just outside                  → evicted
        ]);
        a.videoFrames.set("clip.mp4", frames);

        const before = [...frames.values()];
        a.evictVideoWindow("clip.mp4", now, step);

        const kept = [...frames.values()].map((f: any) => f.timestamp);
        expect(kept).toHaveLength(3);
        expect(kept.some((t) => Math.abs(t - (now - 31 * step)) < 1e-9)).toBe(true);
        expect(kept.some((t) => Math.abs(t - (now + 95 * step)) < 1e-9)).toBe(true);
        expect(kept.some((t) => Math.abs(t - (now - 33 * step)) < 1e-9)).toBe(false);
        expect(kept.some((t) => Math.abs(t - (now + 97 * step)) < 1e-9)).toBe(false);

        // Evicted frames must have their bitmaps closed, or the GPU memory the
        // window exists to bound leaks anyway.
        const evicted = before.filter((f: any) => !kept.includes(f.timestamp));
        for (const f of evicted) expect(f.bitmap.closed).toBe(true);
        for (const f of before.filter((f: any) => kept.includes(f.timestamp))) {
            expect(f.bitmap.closed).toBe(false);
        }
    });

    it("is a no-op for a src with no decoded frames", () => {
        const a = makeAdapter() as any;
        expect(() => a.evictVideoWindow("nothing.mp4", 1, step)).not.toThrow();
    });
});

describe("trimEchoCache", () => {
    const step = 1 / 30;

    it("bounds the cache and drops oldest-inserted first", () => {
        const a = makeAdapter() as any;
        const store = new Map<number, any>();
        // Insert well past the limit, in ascending order.
        for (let i = 0; i < 60; i++) store.set(i, fakeFrame(i * step));
        a.videoEchoFrames.set("clip.mp4", store);

        a.trimEchoCache("clip.mp4");

        expect(store.size).toBe(48);
        // The 12 oldest keys went; the newest survived.
        expect(store.has(0)).toBe(false);
        expect(store.has(11)).toBe(false);
        expect(store.has(12)).toBe(true);
        expect(store.has(59)).toBe(true);
    });

    it("does NOT close a bitmap still shared with the live playback window", () => {
        // The guard that prevents a double-close / use-after-close: the echo cache
        // and the playback window can hold the very same DecodedVideoFrame object,
        // and trimming the echo copy must not free the bitmap playback is drawing.
        const a = makeAdapter() as any;
        const shared = fakeFrame(0);
        const ownedOnly = fakeFrame(1 * step);

        const echo = new Map<number, any>();
        echo.set(0, shared);
        echo.set(1, ownedOnly);
        for (let i = 2; i < 50; i++) echo.set(i, fakeFrame(i * step));
        a.videoEchoFrames.set("clip.mp4", echo);

        // Playback holds the *same object* under the same key.
        const window = new Map<number, any>();
        window.set(0, shared);
        a.videoFrames.set("clip.mp4", window);

        a.trimEchoCache("clip.mp4");

        // Both were trimmed out of the echo cache…
        expect(echo.has(0)).toBe(false);
        expect(echo.has(1)).toBe(false);
        // …but only the unshared one had its bitmap closed.
        expect(shared.bitmap.closed).toBe(false);
        expect(ownedOnly.bitmap.closed).toBe(true);
        // And playback still holds a live frame.
        expect(window.get(0)).toBe(shared);
    });

    it("leaves a cache at or under the limit untouched", () => {
        const a = makeAdapter() as any;
        const store = new Map<number, any>();
        for (let i = 0; i < 48; i++) store.set(i, fakeFrame(i * step));
        a.videoEchoFrames.set("clip.mp4", store);

        a.trimEchoCache("clip.mp4");

        expect(store.size).toBe(48);
        for (const f of store.values()) expect(f.bitmap.closed).toBe(false);
    });
});

describe("claimVideoFrame — per-pass texture slots", () => {
    const step = 1 / 30;
    const SRC = "clip.mp4";

    /**
     * Wire an adapter up with a fake session, a fake surface and a warm frame
     * window, so claim bookkeeping can be observed without decoding anything.
     *
     * The fake surface records each texture call, which is how the premultiply
     * convention below is asserted.
     */
    function primed(timestamps: number[]) {
        const a = makeAdapter() as any;
        const calls: Array<{ fn: string; args: unknown[] }> = [];

        let made = 0;
        a.surface = {
            makeImageFromTextureSource: (...args: unknown[]) => {
                calls.push({ fn: "makeImageFromTextureSource", args });
                return { id: `img${made++}`, delete() { } };
            },
            updateTextureFromSource: (...args: unknown[]) => {
                calls.push({ fn: "updateTextureFromSource", args });
            },
        };

        const session = {
            durationSec: 10,
            frameStep: step,
            width: 640,
            height: 360,
            textureImage: null as unknown,
            uploadedTs: null as number | null,
            decoding: false,
        };
        a.videoSessions.set(SRC, session);
        a.videoFrames.set(SRC, frameMap(step, timestamps));
        return { a, session, calls };
    }

    it("shares one texture when two draws ask for the same time", () => {
        const { a } = primed([0, step, 2 * step]);
        a.beginRenderPass();

        const first = a.claimVideoFrame(SRC, step);
        const second = a.claimVideoFrame(SRC, step);

        expect(first).not.toBeNull();
        expect(second).toBe(first);
        // One claim recorded, so no alt slot was taken.
        expect(a.videoFrameClaims.get(SRC)).toHaveLength(1);
        expect(a.videoAltSlots.get(SRC) ?? []).toHaveLength(0);
    });

    it("gives a second, different time its own texture", () => {
        const { a } = primed([0, step, 2 * step]);
        a.beginRenderPass();

        const atOne = a.claimVideoFrame(SRC, step);
        const atTwo = a.claimVideoFrame(SRC, 2 * step);

        expect(atOne).not.toBeNull();
        expect(atTwo).not.toBeNull();
        // Distinct textures — this is the bug the slots exist to prevent: a shared
        // texture would make both draws sample whatever was uploaded last.
        expect(atTwo).not.toBe(atOne);
        expect(a.videoFrameClaims.get(SRC)).toHaveLength(2);
        expect(a.videoAltSlots.get(SRC)).toHaveLength(1);
    });

    it("records what the texture HOLDS, not what was asked for, so a miss can be shared", () => {
        // Only 0 is decoded. Asking for 5*step misses and paints frame 0; a later
        // draw that genuinely wants frame 0 must then share that texture rather
        // than burning an alt slot on the same picture.
        const { a, session } = primed([0]);
        a.beginRenderPass();

        const missed = a.claimVideoFrame(SRC, 5 * step);
        expect(missed).not.toBeNull();
        // The claim key is the uploaded timestamp (0), not the requested key (5).
        expect(a.videoFrameClaims.get(SRC)).toEqual([session.uploadedTs]);
        expect(a.videoFrameClaims.get(SRC)).toEqual([0]);

        const wantsZero = a.claimVideoFrame(SRC, 0);
        expect(wantsZero).toBe(missed);
        expect(a.videoAltSlots.get(SRC) ?? []).toHaveLength(0);
    });

    it("reuses the last slot past ALT_SLOT_LIMIT instead of dropping the draw", () => {
        const times = Array.from({ length: 20 }, (_, i) => i * step);
        const { a } = primed(times);
        a.beginRenderPass();

        const images = times.map((t) => a.claimVideoFrame(SRC, t));
        // Nothing is dropped…
        for (const img of images) expect(img).not.toBeNull();
        // …and the slot array is capped at 16 (ALT_SLOT_LIMIT).
        expect(a.videoAltSlots.get(SRC)!.length).toBeLessThanOrEqual(16);
    });

    it("beginRenderPass clears claims so the next pass re-claims from slot 0", () => {
        const { a } = primed([0, step]);
        a.beginRenderPass();
        a.claimVideoFrame(SRC, 0);
        a.claimVideoFrame(SRC, step);
        expect(a.videoFrameClaims.get(SRC)).toHaveLength(2);

        a.beginRenderPass();
        expect(a.videoFrameClaims.get(SRC) ?? []).toHaveLength(0);

        // The alt textures persist across passes — that's what makes a scrubbing
        // second playhead a blit rather than an allocation.
        expect(a.videoAltSlots.get(SRC)).toHaveLength(1);
    });

    it("returns null without a session or a surface rather than throwing", () => {
        const a = makeAdapter() as any;
        expect(a.claimVideoFrame("missing.mp4", 0)).toBeNull();

        const { a: b } = primed([0]);
        b.surface = null;
        expect(b.claimVideoFrame(SRC, 0)).toBeNull();
    });

    it("treats a non-finite timestamp as 0 instead of poisoning the claim key", () => {
        const { a } = primed([0]);
        a.beginRenderPass();
        expect(a.claimVideoFrame(SRC, NaN)).not.toBeNull();
        expect(a.videoFrameClaims.get(SRC)).toEqual([0]);
    });

    it("uploads video frames UNPREMULTIPLIED, with no srcIsPremul flag", () => {
        // The video path omits the flag entirely, where the 3D path passes it as
        // `false`; both describe unpremultiplied sources, and the difference is
        // only that CanvasKit already defaults to that. Collapsing the two into
        // one signature is still a mistake the storage-adapter split could make —
        // a decoded frame and a 3D canvas do not arrive the same way.
        const { a, calls } = primed([0, step]);
        a.beginRenderPass();
        a.claimVideoFrame(SRC, 0);
        a.claimVideoFrame(SRC, step);   // forces an alt-slot upload too

        const makes = calls.filter((c) => c.fn === "makeImageFromTextureSource");
        expect(makes.length).toBeGreaterThanOrEqual(2);
        for (const call of makes) {
            const info = call.args[1] as Record<string, unknown>;
            expect(info.alphaType).toBe(ck.AlphaType.Unpremul);
            expect(info.colorType).toBe(ck.ColorType.RGBA_8888);
            expect(info.colorSpace).toBe(ck.ColorSpace.SRGB);
            // No third argument — unlike the 3D path, which must pass `true`.
            expect(call.args).toHaveLength(2);
        }
    });

    it("re-uploads in place on a later pass rather than allocating a new texture", () => {
        const { a, calls } = primed([0, step, 2 * step]);
        a.beginRenderPass();
        a.claimVideoFrame(SRC, 0);
        a.claimVideoFrame(SRC, step);        // allocates alt slot 0

        const madeFirstPass = calls.filter((c) => c.fn === "makeImageFromTextureSource").length;

        a.beginRenderPass();
        a.claimVideoFrame(SRC, 0);
        a.claimVideoFrame(SRC, 2 * step);    // same slot, different time

        const madeSecondPass = calls.filter((c) => c.fn === "makeImageFromTextureSource").length;
        expect(madeSecondPass).toBe(madeFirstPass);
        expect(calls.some((c) => c.fn === "updateTextureFromSource")).toBe(true);
    });
});

describe("upload3DFrame", () => {
    /**
     * A fake surface whose images report the size they were created at, which is
     * what `upload3DFrame` inspects to decide between an in-place update and a
     * reallocation.
     */
    function fake3DSurface() {
        const a = makeAdapter() as any;
        const counts = { made: 0, updated: 0 };
        const makeArgs: unknown[][] = [];
        const updateArgs: unknown[][] = [];
        const deleted = vi.fn();

        a.surface = {
            makeImageFromTextureSource: (...args: unknown[]) => {
                counts.made++;
                makeArgs.push(args);
                const info = args[1] as { width: number; height: number };
                return {
                    width: () => info.width,
                    height: () => info.height,
                    delete: deleted,
                };
            },
            updateTextureFromSource: (...args: unknown[]) => {
                counts.updated++;
                updateArgs.push(args);
            },
        };
        return { a, counts, makeArgs, updateArgs, deleted };
    }

    // This pairing used to be `Premul` + `srcIsPremul: true`, on the reasoning
    // that three's canvas is premultiplied — which it is. What that missed is the
    // *upload*: a canvas handed over as a texture source goes through the
    // browser's unpack pipeline, where `UNPACK_PREMULTIPLY_ALPHA_WEBGL` is false
    // by default, so the alpha is divided back out and what reaches Skia is
    // straight colour. Declaring it premultiplied made Skia composite
    // `src + (1-a)·dst`, i.e. additively: every translucent 3D surface rendered
    // at full strength, invisibly, because the two formulas agree at `a = 1` and
    // every opaque scene is exactly that.
    //
    // The dark fringes that motivated the old flag were real, but they came from
    // the *mismatched* pairing (`Premul` with the flag omitted, which converts
    // and premultiplies a second time). Declaring the source unpremultiplied —
    // which it is — fixes both: `a·src + (1-a)·dst`, edges included.
    it("uploads UNPREMULTIPLIED, because the texture upload unpremultiplies it", () => {
        const { a, makeArgs } = fake3DSurface();

        const image = a.upload3DFrame("node#0", { fake: "canvas" }, 320, 240);
        expect(image).not.toBeNull();
        expect(makeArgs).toHaveLength(1);

        const [, info, srcIsPremul] = makeArgs[0];
        expect((info as Record<string, unknown>).alphaType).toBe(ck.AlphaType.Unpremul);
        expect(srcIsPremul).toBe(false);
    });

    it("updates the existing texture on a second frame of the same size", () => {
        const { a, counts } = fake3DSurface();

        a.upload3DFrame("node#0", { fake: "canvas" }, 320, 240);
        a.upload3DFrame("node#0", { fake: "canvas" }, 320, 240);

        expect(counts.made).toBe(1);
        expect(counts.updated).toBe(1);
    });

    // The two paths must agree, or a 3D node would composite one way on the frame
    // it is created and another on every frame after it — which reads as a flicker
    // on the second frame and nothing else.
    it("says the same thing on the in-place update path, not just creation", () => {
        const { a, updateArgs } = fake3DSurface();
        a.upload3DFrame("node#0", { fake: "canvas" }, 320, 240);
        a.upload3DFrame("node#0", { fake: "canvas" }, 320, 240);

        expect(updateArgs).toHaveLength(1);
        expect(updateArgs[0][2]).toBe(false);
    });

    it("reallocates when the quantized buffer grows, since a texture is fixed-size", () => {
        // three's renderer rounds its drawing buffer up to a 64px quantum and never
        // shrinks it, so a scaling node changes size in steps. A texture can't be
        // resized, so a size change must produce a fresh one — reusing the old one
        // would sample a mismatched rect.
        const { a, counts, deleted } = fake3DSurface();

        a.upload3DFrame("node#0", { fake: "canvas" }, 320, 240);
        a.upload3DFrame("node#0", { fake: "canvas" }, 384, 240);   // grew one quantum

        expect(counts.made).toBe(2);
        expect(counts.updated).toBe(0);
        // The stale texture is freed rather than leaked.
        expect(deleted).toHaveBeenCalledTimes(1);
        expect(a.canvas3DTextures.size).toBe(1);
    });

    it("release3DTexture frees the slot so a removed node stops pinning GPU memory", () => {
        const { a, deleted } = fake3DSurface();

        a.upload3DFrame("node#0", { fake: "canvas" }, 320, 240);
        expect(a.canvas3DTextures.size).toBe(1);

        a.release3DTexture("node#0");
        expect(deleted).toHaveBeenCalledTimes(1);
        expect(a.canvas3DTextures.size).toBe(0);
    });
});
