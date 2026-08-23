import { describe, it, expect } from "vitest";

import { LayerStack, ProjectGlobals, audioTimelineDuration, layerAppliesTo, resolveGlobalAudio } from "@/runtime/globals";
import { AudioFilters } from "@/attributes/audio/filters/chain";
import { Node2D } from "@/nodes/base/node2d";
import { Rect } from "@/nodes/geometry/rect-node";
import { RenderContext2D } from "@/render/render-context2d";
import { NullRenderContext } from "@/render/null-render-context";
import { ContextMap } from "@/util/context";
import { asCatalog, FakeAssetCatalog, FakeMeasurer } from "./runtime.fixtures";

const VIEWPORT = { width: 800, height: 400 };
const BOUNDS = { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height };

/**
 * A leaf that records the order it was drawn in. `NullRenderContext` is a real
 * `RenderContext2D` that never rasterizes, so it can drive a full render walk in a
 * plain Node environment — the probe just appends its label as it goes.
 */
class Probe extends Node2D {
    constructor(private readonly log: string[], private readonly label: string) {
        super({ width: 10, height: 10 });
    }
    protected override renderSelf(_ctx: RenderContext2D): void {
        this.log.push(this.label);
    }
}

const trackingContext = () => new NullRenderContext();

// ─── Global audio beds ────────────────────────────────────────────────────────

describe("resolveGlobalAudio", () => {
    // The fake catalog reports 10s for any src it isn't told otherwise about.
    const catalog = (durations: Record<string, number> = {}, missing?: Set<string>) =>
        asCatalog(new FakeAssetCatalog(durations, missing));

    it("runs from startAt for the source's full length when no trim is given", () => {
        const { requests, errors } = resolveGlobalAudio(
            [{ src: "music.mp3" }],
            catalog({ "music.mp3": 4 }),
            30,
        );
        expect(errors).toEqual([]);
        expect(requests).toHaveLength(1);
        expect(requests[0]).toMatchObject({ src: "music.mp3", startAt: 0, endAt: 4, trimStart: 0, loop: false, volume: 1 });
    });

    it("crops to trimStart/trimEnd and places the crop at startAt", () => {
        const { requests } = resolveGlobalAudio(
            [{ src: "music.mp3", startAt: 2, trimStart: 5, trimEnd: 8 }],
            catalog({ "music.mp3": 30 }),
            30,
        );
        // 3s of source, dropped in at t=2 → [2, 5).
        expect(requests[0]).toMatchObject({ startAt: 2, endAt: 5, trimStart: 5 });
    });

    it("clamps trimEnd to the source length", () => {
        const { requests } = resolveGlobalAudio(
            [{ src: "music.mp3", trimEnd: 999 }],
            catalog({ "music.mp3": 6 }),
            30,
        );
        expect(requests[0].endAt).toBe(6);
    });

    it("never runs past the project end", () => {
        const { requests } = resolveGlobalAudio(
            [{ src: "music.mp3", startAt: 1 }],
            catalog({ "music.mp3": 60 }),
            10,
        );
        expect(requests[0]).toMatchObject({ startAt: 1, endAt: 10 });
    });

    it("runs a looping bed to the project end", () => {
        const { requests } = resolveGlobalAudio(
            [{ src: "beat.mp3", loop: true }],
            catalog({ "beat.mp3": 2 }),
            17.5,
        );
        expect(requests[0]).toMatchObject({ loop: true, startAt: 0, endAt: 17.5 });
    });

    it("scales the footprint by a speed filter, exactly as a scene Sound does", () => {
        const { requests } = resolveGlobalAudio(
            [{ src: "music.mp3", filters: AudioFilters.speed(2) }],
            catalog({ "music.mp3": 8 }),
            30,
        );
        // 8s of source at 2× occupies 4s of timeline.
        expect(requests[0].endAt).toBe(4);
        expect(requests[0].filters).toEqual([{ type: "speed", value: 2 }]);
    });

    it("drops a bed that starts at or after the project end, without an error", () => {
        const { requests, errors } = resolveGlobalAudio(
            [{ src: "music.mp3", startAt: 12 }],
            catalog(),
            10,
        );
        expect(requests).toEqual([]);
        expect(errors).toEqual([]);
    });

    it("reports an unknown src as an error rather than failing silently", () => {
        const { requests, errors } = resolveGlobalAudio(
            [{ src: "nope.mp3" }, { src: "music.mp3" }],
            catalog({}, new Set(["nope.mp3"])),
            30,
        );
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain("nope.mp3");
        // The good track still resolves — one bad entry doesn't take the rest down.
        expect(requests.map(r => r.src)).toEqual(["music.mp3"]);
    });

    it("reports an inverted crop as an error", () => {
        const { requests, errors } = resolveGlobalAudio(
            [{ src: "music.mp3", trimStart: 5, trimEnd: 3 }],
            catalog({ "music.mp3": 30 }),
            30,
        );
        expect(requests).toEqual([]);
        expect(errors[0]).toContain("trimEnd");
    });

    it("gives every track a distinct id so two beds off one file both schedule", () => {
        const { requests } = resolveGlobalAudio(
            [{ src: "music.mp3", startAt: 0, trimEnd: 2 }, { src: "music.mp3", startAt: 5, trimEnd: 2 }],
            catalog({ "music.mp3": 30 }),
            30,
        );
        expect(requests).toHaveLength(2);
        expect(requests[0].id).not.toBe(requests[1].id);
    });
});

describe("audioTimelineDuration", () => {
    const catalog = (durations: Record<string, number> = {}, missing?: Set<string>) =>
        asCatalog(new FakeAssetCatalog(durations, missing));

    it("is zero for no tracks", () => {
        expect(audioTimelineDuration([], catalog())).toBe(0);
    });

    it("reaches the end of the furthest track, not the sum of them", () => {
        const duration = audioTimelineDuration(
            [{ src: "a.mp3" }, { src: "b.mp3", startAt: 2 }],
            catalog({ "a.mp3": 4, "b.mp3": 3 }),
        );
        // a ends at 4, b at 2+3=5 — overlapping clips stack, they don't queue.
        expect(duration).toBe(5);
    });

    it("measures the trimmed length, not the source's", () => {
        const duration = audioTimelineDuration(
            [{ src: "a.mp3", startAt: 10, trimStart: 5, trimEnd: 8 }],
            catalog({ "a.mp3": 60 }),
        );
        expect(duration).toBe(13);
    });

    it("ignores looping tracks, which have no end of their own", () => {
        const duration = audioTimelineDuration(
            [{ src: "bed.mp3", loop: true }, { src: "vo.mp3", startAt: 1 }],
            catalog({ "bed.mp3": 30, "vo.mp3": 2 }),
        );
        expect(duration).toBe(3);
    });

    it("is zero when every track loops, so the caller must set a duration", () => {
        const duration = audioTimelineDuration(
            [{ src: "bed.mp3", loop: true }],
            catalog({ "bed.mp3": 30 }),
        );
        expect(duration).toBe(0);
    });

    it("skips tracks it cannot resolve rather than throwing", () => {
        const duration = audioTimelineDuration(
            [{ src: "nope.mp3" }, { src: "a.mp3", startAt: 1 }],
            catalog({ "a.mp3": 2 }, new Set(["nope.mp3"])),
        );
        expect(duration).toBe(3);
    });

    it("agrees with resolveGlobalAudio — nothing is clipped at its own duration", () => {
        const tracks = [{ src: "a.mp3" }, { src: "b.mp3", startAt: 2 }];
        const assets = catalog({ "a.mp3": 4, "b.mp3": 3 });

        const duration = audioTimelineDuration(tracks, assets);
        const { requests } = resolveGlobalAudio(tracks, assets, duration);

        // The whole point of deriving the duration first: resolving against it
        // must keep every clip whole, including the one that defined it.
        expect(requests).toHaveLength(2);
        expect(Math.max(...requests.map(r => r.endAt))).toBe(duration);
    });
});

// ─── Layer selection ─────────────────────────────────────────────────────────

describe("LayerStack – scene filtering", () => {
    /** Render the stack for one scene and return the labels that actually drew. */
    const drawnFor = (stack: LayerStack, index: number, name: string, log: string[]): string[] => {
        log.length = 0;
        stack.select(index, name);
        const ctx = trackingContext();
        ctx.execute(() => stack.render(ctx));
        return [...log];
    };

    const build = () => {
        const log: string[] = [];
        const stack = new LayerStack("overlay", [
            new Probe(log, "everywhere"),
            { node: new Probe(log, "intro-only"), include: "intro" },
            { node: new Probe(log, "not-outro"), exclude: "outro" },
            { node: new Probe(log, "by-index"), include: [0, 2] },
        ], VIEWPORT);
        stack.bindAssets(asCatalog(new FakeAssetCatalog()));
        stack.bindContext(ContextMap.EMPTY);
        stack.layout(BOUNDS, new FakeMeasurer());
        return { stack, log };
    };

    it("draws unfiltered layers on every scene", () => {
        const { stack, log } = build();
        expect(drawnFor(stack, 0, "intro", log)).toContain("everywhere");
        expect(drawnFor(stack, 1, "middle", log)).toContain("everywhere");
        expect(drawnFor(stack, 2, "outro", log)).toContain("everywhere");
    });

    it("honours an include allow-list by name", () => {
        const { stack, log } = build();
        expect(drawnFor(stack, 0, "intro", log)).toContain("intro-only");
        expect(drawnFor(stack, 1, "middle", log)).not.toContain("intro-only");
    });

    it("honours an exclude deny-list by name", () => {
        const { stack, log } = build();
        expect(drawnFor(stack, 1, "middle", log)).toContain("not-outro");
        expect(drawnFor(stack, 2, "outro", log)).not.toContain("not-outro");
    });

    it("matches a name regardless of case and separators", () => {
        const log: string[] = [];
        // What the `?scene` transform makes of `cross-fade.tsx`.
        const stack = new LayerStack("overlay", [
            { node: new Probe(log, "a"), include: "cross-fade" },
            { node: new Probe(log, "b"), include: "CrossFade" },
            { node: new Probe(log, "c"), include: "cross fade" },
            { node: new Probe(log, "d"), include: "crossfaded" },
        ], VIEWPORT);
        stack.bindContext(ContextMap.EMPTY);
        stack.layout(BOUNDS, new FakeMeasurer());
        expect(drawnFor(stack, 0, "CrossFade", log)).toEqual(["a", "b", "c"]);
    });

    it("matches scene indices as well as names", () => {
        const { stack, log } = build();
        expect(drawnFor(stack, 0, "intro", log)).toContain("by-index");
        expect(drawnFor(stack, 1, "middle", log)).not.toContain("by-index");
        expect(drawnFor(stack, 2, "outro", log)).toContain("by-index");
    });

    it("draws layers in config order", () => {
        const { stack, log } = build();
        expect(drawnFor(stack, 0, "intro", log)).toEqual(["everywhere", "intro-only", "not-outro", "by-index"]);
    });

    it("applies exclude after include, so the two can cancel", () => {
        const log: string[] = [];
        const stack = new LayerStack("overlay", [
            { node: new Probe(log, "narrow"), include: ["a", "b"], exclude: "b" },
        ], VIEWPORT);
        stack.bindContext(ContextMap.EMPTY);
        stack.layout(BOUNDS, new FakeMeasurer());
        expect(drawnFor(stack, 0, "a", log)).toEqual(["narrow"]);
        expect(drawnFor(stack, 1, "b", log)).toEqual([]);
    });

    it("invokes a factory layer once, at construction", () => {
        let calls = 0;
        const stack = new LayerStack("background", [
            () => { calls++; return new Rect({ width: 10, height: 10 }); },
        ], VIEWPORT);
        expect(calls).toBe(1);
        stack.select(0, "a");
        stack.select(1, "b");
        expect(calls).toBe(1);
    });

    it("keeps a config-provided node usable after dispose, but frees a factory-built one", () => {
        const provided = new Rect({ width: 10, height: 10 });
        const stack = new LayerStack("overlay", [provided, () => new Rect({ width: 10, height: 10 })], VIEWPORT);
        stack.dispose();
        // A node the project owns outlives the runtime (StrictMode double-mount,
        // HMR): it is detached from its frame, not torn down, so the next
        // controller can adopt it intact.
        expect(provided.parent).toBeNull();
        expect(() => provided.width).not.toThrow();
        expect(new LayerStack("overlay", [provided], VIEWPORT)).toBeDefined();
    });

    it("reports empty for a project that declares no layers", () => {
        expect(new LayerStack("overlay", undefined, VIEWPORT).isEmpty).toBe(true);
        expect(new LayerStack("overlay", [], VIEWPORT).isEmpty).toBe(true);
    });
});

// ─── The selection rule, as the timeline sees it ─────────────────────────────

/**
 * `layerAppliesTo` is what the player's timeline draws each layer's bar from.
 * It must agree with `LayerStack.select` — which it does by construction (one
 * shared implementation); these pin the contract the player relies on.
 */
describe("layerAppliesTo", () => {
    const node = () => new Rect({ width: 10, height: 10 });

    it("accepts every loose config form", () => {
        expect(layerAppliesTo(new Rect({}), 0, "any")).toBe(true);
        expect(layerAppliesTo(node, 0, "any")).toBe(true);
        expect(layerAppliesTo({ node }, 0, "any")).toBe(true);
    });

    it("applies include, then exclude", () => {
        expect(layerAppliesTo({ node, include: "intro" }, 0, "Intro")).toBe(true);
        expect(layerAppliesTo({ node, include: "intro" }, 1, "Outro")).toBe(false);
        expect(layerAppliesTo({ node, exclude: "outro" }, 1, "Outro")).toBe(false);
        expect(layerAppliesTo({ node, include: 0, exclude: 0 }, 0, "Intro")).toBe(false);
    });

    it("agrees with what LayerStack actually selects", () => {
        const log: string[] = [];
        const config = { node: new Probe(log, "x"), include: ["intro", 2] };
        const stack = new LayerStack("overlay", [config], VIEWPORT);
        stack.bindContext(ContextMap.EMPTY);
        stack.layout(BOUNDS, new FakeMeasurer());

        for (const [index, name] of [[0, "Intro"], [1, "Demo"], [2, "Outro"]] as const) {
            log.length = 0;
            stack.select(index, name);
            const ctx = trackingContext();
            ctx.execute(() => stack.render(ctx));
            expect(log.length > 0).toBe(layerAppliesTo(config, index, name));
        }
    });
});

// ─── Draw order ──────────────────────────────────────────────────────────────

describe("ProjectGlobals", () => {
    it("keeps backgrounds and overlays as independently-filtered stacks", () => {
        const log: string[] = [];
        const globals = new ProjectGlobals({
            backgrounds: [{ node: new Probe(log, "bg"), exclude: "outro" }],
            overlays: [new Probe(log, "fg")],
        }, VIEWPORT);
        globals.bindContext(ContextMap.EMPTY);
        globals.layout(BOUNDS, new FakeMeasurer());

        const ctx = trackingContext();
        globals.select(0, "intro");
        ctx.execute(() => {
            globals.backgrounds.render(ctx);
            log.push("scene");
            globals.overlays.render(ctx);
        });
        expect(log).toEqual(["bg", "scene", "fg"]);

        log.length = 0;
        globals.select(1, "outro");
        ctx.execute(() => {
            globals.backgrounds.render(ctx);
            log.push("scene");
            globals.overlays.render(ctx);
        });
        expect(log).toEqual(["scene", "fg"]);
    });

    it("reports hasLayers only when something is configured", () => {
        expect(new ProjectGlobals({}, VIEWPORT).hasLayers).toBe(false);
        expect(new ProjectGlobals({ audioTracks: [{ src: "a.mp3" }] }, VIEWPORT).hasLayers).toBe(false);
        expect(new ProjectGlobals({ overlays: [new Rect({})] }, VIEWPORT).hasLayers).toBe(true);
    });
});
