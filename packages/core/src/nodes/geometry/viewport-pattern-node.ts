import { RenderContext } from "@/render/render-context";
import { Clip } from "@/render/clip";
import { BoxBounds } from "@/attributes/layout/bounds";
import { Camera } from "../layout/camera-node";
import { ShapeNode, ShapeProps } from "./shape-node";

/**
 * Base for backgrounds that fill whatever region is currently visible, rather
 * than a fixed rect. Placed inside a {@link Camera}, the node resolves the
 * world region the camera can currently see (from its `zoom`/`origin`/`heading`)
 * and hands those bounds to {@link renderPattern}, so the subclass only ever
 * generates geometry for what's on screen — no oversized static node sized for
 * the worst-case pan/zoom.
 *
 * With no ancestor `Camera` the node falls back to its own layout rect, so the
 * same pattern doubles as an ordinary full-bleed background.
 *
 * The pattern node is itself a camera child, laid out stack-style at the
 * camera's centre, so its local draw space shares the world origin its siblings
 * use. The visible region is therefore expressed directly in that space: centred
 * on the camera's `origin`, sized to the inverse of the camera transform.
 */
export abstract class ViewportPattern<P extends ShapeProps = ShapeProps> extends ShapeNode<P> {

    /**
     * Fill `bounds` (in this node's local draw space) with the pattern. Called
     * once per render with the currently-visible region. The `centerBounds` for
     * path ops drawn here is `[bounds.x - w/2, bounds.y - h/2, bounds.x + w/2,
     * bounds.y + h/2]`.
     */
    protected abstract renderPattern(draw: RenderContext, bounds: BoxBounds): void;

    protected renderSelf(draw: RenderContext): void {
        const bounds = this.visibleBounds();
        // Clip to the visible region so geometry overscanned past the edge (so
        // thick lines slide out instead of popping) trims cleanly. When inside a
        // camera the viewport already clips, but this keeps edge strokes clean
        // and bounds the work in the no-camera fallback too.
        draw.beginClip(new Clip().rect({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }));
        this.renderPattern(draw, bounds);
        draw.endClip();
    }

    /**
     * The region this node should cover, in its own local draw space. Inside a
     * camera this is the world rect the camera currently sees; otherwise it's the
     * node's own layout rect (a normal background).
     */
    protected visibleBounds(): BoxBounds {
        const camera = this.findCamera();
        if (!camera) {
            // No camera — fill our own cell, centred on this node's origin.
            const w = this.layoutRect?.width ?? 0;
            const h = this.layoutRect?.height ?? 0;
            return { x: 0, y: 0, width: w, height: h };
        }

        const vw = camera.measuredWidth;
        const vh = camera.measuredHeight;
        const zoom = camera.zoom || 1;
        const heading = camera.heading;

        // Inverse of the camera scale: a viewport `vw×vh` shows `vw/zoom × vh/zoom`
        // of the world.
        const hw = vw / 2 / zoom;
        const hh = vh / 2 / zoom;

        // With a heading the visible world rect is rotated; take its axis-aligned
        // bounding box so the pattern covers the rotated viewport's full extent.
        let bw = hw;
        let bh = hh;
        if (heading !== 0) {
            const rad = (heading * Math.PI) / 180;
            const cos = Math.abs(Math.cos(rad));
            const sin = Math.abs(Math.sin(rad));
            bw = hw * cos + hh * sin;
            bh = hw * sin + hh * cos;
        }

        // The visible region centres on the camera's `lookAt`, returned in y-UP
        // world space (matching the descriptor convention; the renderer applies
        // the single y-up→canvas flip when the pattern's shapes are drawn). A
        // y-down consumer would have wanted -lookAt.y; we hand back the y-up value.
        const lookAt = camera.lookAt;
        return { x: lookAt.x, y: lookAt.y, width: bw * 2, height: bh * 2 };
    }

    /** Nearest ancestor {@link Camera}, or `null` when rendered outside one. */
    protected findCamera(): Camera | null {
        for (let n = this.parent; n; n = n.parent) {
            if (n instanceof Camera) return n;
        }
        return null;
    }
}
