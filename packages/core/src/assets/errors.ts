import type { AssetType } from "./record";

/**
 * A frame reached for an asset that was never loaded.
 *
 * This is the counterweight to declared asset tracking. A node states what it
 * needs into an `AssetTracker` (see `Node.prepareLayout`/`prepareRender`); if it
 * misses something, the renderer finds nothing when it goes to paint. The old
 * inference pass could not really get this wrong — it discovered assets *from*
 * the draw calls, so anything drawn was by construction requested — and the
 * fills were written to match: a missing decode returned `false` and the layer
 * was quietly skipped.
 *
 * Under declarations that leniency is the wrong default. A skipped layer is a
 * frame that renders *almost* right, with a photo missing or a heading in the
 * fallback face, on a node that may only appear seconds in and only on a cold
 * load. Throwing turns a silent visual gap into a located failure: during precomp
 * it is caught per scene and surfaces as a `BuildError` in the errors panel, and
 * at playback it stops the frame rather than shipping a wrong one.
 *
 * It means "declared but not loaded, or never declared". It deliberately does
 * **not** cover a *time-varying* miss — a video frame the decode window has not
 * reached yet is an asset that loaded fine, and `warmPendingVideo` already exists
 * to settle those; those paths still paint the nearest decoded frame.
 */
export class AssetNotLoadedError extends Error {
    readonly assetType: AssetType;
    readonly src: string;

    constructor(assetType: AssetType, src: string, hint?: string) {
        super(
            `${assetType} asset "${src}" is not loaded. ` +
            (hint ?? `Declare it from the node's prepare${assetType === "font" ? "Layout" : "Render"}() ` +
                `(e.g. tracker.add${assetType === "font" ? "Font" : "Image"}(...)), so the asset timeline loads it before this frame draws.`)
        );
        this.name = "AssetNotLoadedError";
        this.assetType = assetType;
        this.src = src;
    }
}
