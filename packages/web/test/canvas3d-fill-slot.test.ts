import { describe, it, expect, vi } from "vitest";
import type { FillResolved } from "@motion-script/core";
import { FillHandler } from "@motion-script/skia-render/fills/handler";

/**
 * The paint-slot allocator, tested directly.
 *
 * A 3D fill keys its live scene graph, its GPU buffer size and its CanvasKit
 * texture off `${nodeId}#${slot}`. Getting the slot wrong is not a cosmetic bug:
 * two fills colliding on one key means the second upload mutates the same GPU
 * texture the first fill's queued draw already referenced, and Skia resolves both
 * at flush — so you see one scene painted twice.
 */

let nodeId = "node-a";

function handler(): FillHandler {
    // Only the node-id closure matters here; the rest of the constructor's
    // collaborators are never reached by paintSlot.
    return new FillHandler(
        {} as never,
        () => ({}) as never,
        () => ({}) as never,
        () => null,
        () => null,
        {} as never,
        () => 1,
        () => nodeId,
        () => 1,
    );
}

/** `paintSlot` is private; the renderer context is how it is actually reached. */
function slotOf(h: FillHandler, fill: FillResolved): number {
    return h.buildRendererCtx({} as never).paintSlot(fill);
}

const fill = (type = "canvas3D") => ({ type } as unknown as FillResolved);

describe("FillHandler paint slots", () => {
    it("gives the same resolved fill the same slot every time it is asked", () => {
        const h = handler();
        const a = fill();

        // One frame hands the same object to the shadow pass, the fill pass and
        // the inner-shadow pass. All three must agree, or the scene renders thrice.
        expect(slotOf(h, a)).toBe(0);
        expect(slotOf(h, a)).toBe(0);
        expect(slotOf(h, a)).toBe(0);
    });

    it("gives two distinct fills on one node distinct slots", () => {
        const h = handler();
        expect(slotOf(h, fill())).toBe(0);
        expect(slotOf(h, fill())).toBe(1);
    });

    it("scopes slots per node, so unrelated nodes both start at 0", () => {
        const h = handler();
        nodeId = "node-a";
        expect(slotOf(h, fill())).toBe(0);
        nodeId = "node-b";
        expect(slotOf(h, fill())).toBe(0);
        nodeId = "node-a";
    });

    it("resets on beginFrame, since the fill array is rebuilt each frame", () => {
        const h = handler();
        slotOf(h, fill());
        slotOf(h, fill());

        h.beginFrame();
        expect(slotOf(h, fill())).toBe(0);
    });

    // The cross-fade at lerpFillArray transiently stacks the outgoing and
    // incoming fills, which is precisely when a node carries two 3D fills.
    it("keeps a cross-fade's two layers on separate slots", () => {
        const h = handler();
        const outgoing = fill();
        const incoming = fill();

        expect(slotOf(h, outgoing)).toBe(0);
        expect(slotOf(h, incoming)).toBe(1);
        // Re-asking mid-frame (the second paint pass) must not renumber them.
        expect(slotOf(h, outgoing)).toBe(0);
        expect(slotOf(h, incoming)).toBe(1);
    });
});

describe("FillRenderer.preflight seam", () => {
    it("is exposed on the registry and no-ops for fills without one", async () => {
        const { FillRenderRegistry } = await import("@motion-script/skia-render/fills/registry");
        // A solid fill has no preflight; the registry must tolerate that silently
        // rather than throwing mid-frame.
        expect(() => FillRenderRegistry.preflight(fill("solid"), {} as never)).not.toThrow();
    });

    // The shadow / inner-shadow silhouette pass never runs preflight, so a 3D
    // fill has nothing to shade with there and must decline — quietly, since the
    // author has done nothing wrong and the pass runs whether or not a shadow was
    // authored.
    it("declines silently when nothing was preflighted", async () => {
        const { FillRenderRegistry } = await import("@motion-script/skia-render/fills/registry");
        const warn = vi.spyOn(console, "warn").mockImplementation(() => { });

        const painted = FillRenderRegistry.applyPaint(fill(), {
            preflighted: new Map(),
        } as never);

        expect(painted).toBe(false);
        expect(warn).not.toHaveBeenCalled();
        warn.mockRestore();
    });
});
