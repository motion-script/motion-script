import type { Image as CKImage } from "@motion-script/canvaskit";
import {
    forEachTexture3D, isSurfaceTexture3D,
    type Graphics3D, type RasterizedSurface, type SurfaceTexture3D, type View3DFillResolved,
} from "@motion-script/core";
import { FillRenderer, type FillRendererContext } from "./renderer";
import { computeImageMatrix } from "./image";
import { view3DBackend } from "../three/backend";
import { requestView3DWarm } from "../three/bridge";

/**
 * Rasterize every `Tex.surface` in a scene, keyed by descriptor identity.
 *
 * Identity rather than a name: the descriptor *is* the reference now, so two
 * structurally identical surfaces stay distinct and nothing has to be unique
 * across a scene. Deduped, so one descriptor mapped onto several materials
 * rasterizes once.
 */
function rasterizeSurfaces(
    g3: Graphics3D,
    ctx: FillRendererContext,
): ReadonlyMap<SurfaceTexture3D, RasterizedSurface> | undefined {
    let rasters: Map<SurfaceTexture3D, RasterizedSurface> | undefined;
    forEachTexture3D(g3, (texture) => {
        if (!isSurfaceTexture3D(texture)) return;
        if (rasters?.has(texture)) return;
        const raster = ctx.rasterizeSurface(
            texture.source, texture.width, texture.height, texture.maxPixelRatio ?? 1,
        );
        if (raster) (rasters ??= new Map()).set(texture, raster);
    });
    return rasters;
}

/**
 * Paints a 3D scene through the shape's own path.
 *
 * The scene renders to an offscreen buffer, uploads to a `CKImage`, and becomes a
 * **shader** on the paint — so the handler's ordinary `drawPath` confines it to
 * whatever geometry is being filled. That is the whole reason 3D works in an
 * `Ellipse`, a `Path` or a run of `Text`: none of them are special-cased, they
 * just get a shader like an image fill does.
 *
 * The render happens in {@link preflight}, not {@link applyPaint}, because it
 * re-enters the render context and would otherwise reset the shared paint that
 * `applyFills` had already configured for this very fill.
 */
export class View3DFillRenderer extends FillRenderer<View3DFillResolved> {

    override preflight(fill: View3DFillResolved, ctx: FillRendererContext): void {
        // Per-node-per-fill, so two 3D fills on one node keep separate scene
        // graphs, GPU buffers and textures. Without this the second fill's
        // upload would mutate the texture the first one's queued draw still
        // references — Skia resolves both at flush, so you'd see one scene twice.
        const key = `${ctx.nodeId}#${ctx.paintSlot(fill)}`;

        const backend = view3DBackend(ctx.assets);
        if (!backend) {
            // three hasn't loaded yet. Ask for a warm and skip this frame; the
            // exporter and screenshot paths drain the request and re-render, so
            // no frame ships without its 3D.
            requestView3DWarm(key);
            return;
        }

        // Read the bounds *before* rasterizing: a nested draw resets the
        // handler's current bounds on its way out.
        const bounds = ctx.getShapeBounds();
        if (!bounds) return;
        const width = bounds.right - bounds.left;
        const height = bounds.bottom - bounds.top;
        if (!(width > 0) || !(height > 0)) return;

        // 2D-on-3D. Rasterized here, before the scene syncs, so the material has
        // this frame's pixels — which is what keeps a scrubbed frame identical to
        // a played one.
        const rasters = rasterizeSurfaces(fill.graphics3D, ctx);

        // Device pixels come from the live canvas matrix, so a scaled parent, a
        // zoomed camera and a `--scale 2` export all size the buffer correctly.
        const ratio = Math.min(fill.maxPixelRatio ?? 2, Math.max(ctx.getDeviceScale(), 1));

        const rendered = backend.render(
            key,
            fill.graphics3D,
            Math.max(1, Math.ceil(width * ratio)),
            Math.max(1, Math.ceil(height * ratio)),
            { antialias: fill.antialias !== false, rasters },
        );

        const image = ctx.assets.upload3DFrame(key, rendered.source, rendered.width, rendered.height);
        if (image) ctx.preflighted.set(fill, image);
    }

    applyPaint(fill: View3DFillResolved, ctx: FillRendererContext): boolean {
        const image = ctx.preflighted.get(fill) as CKImage | undefined;
        // Nothing preflighted. Either three hasn't loaded (a warm was requested
        // above and the frame will be re-rendered), or this is the shadow /
        // inner-shadow silhouette pass, which paints from inside a `saveLayer`
        // and never runs preflight — so a 3D fill casts no shadow of its own.
        // Declining is the same contract an image fill has while it decodes.
        if (!image) return false;

        // `stretch` maps the whole buffer onto the shape's bounds, which is
        // exactly what the old drawImageRect(full buffer → node rect) composite
        // did — and it cancels the distortion from the renderer's buffer-size
        // quantization, since the scene is framed at the unquantized aspect.
        //
        // Decal, not Clamp: with `space: 'parent'`/`'global'` the path can extend
        // past the bounds, where clamping would smear the edge pixels instead of
        // drawing nothing.
        const ck = ctx.canvasKit as any;
        const matrix = computeImageMatrix(image.width(), image.height(), { fit: "stretch" }, ctx.getShapeBounds());
        ctx.paint.setShader(
            image.makeShaderOptions(ck.TileMode.Decal, ck.TileMode.Decal, ck.FilterMode.Linear, ck.MipmapMode.None, matrix),
        );

        // The image is adapter-owned and reused across frames, so it must NOT go
        // in `transientImages` — the handler deletes those after the draw.
        //
        // `worldAlpha` and `blend` are the handler's business (it has already set
        // them on the paint); re-applying them here would double them.
        return true;
    }
}
