import { RenderContext2D } from "@/render/render-context2d";
import { Graphics2D } from "@/render/graphics2d";
import { ImageAdjustment, resolveChainAdjustments } from "@/attributes/shape/filters/chain";
import { lerpFilterArray } from "@/attributes/shape/filters/registry";
import { MediaAdjustment } from "@/attributes/shape/filters/union";
import { ImageCrop, ImageFit, ImageFillProp, ImageFillResolved, ImageMatrix } from "@/attributes/shape/fill/implementations/image";
import { prepareFill, resolveFill } from "@/attributes/shape/fill/registry";
import { FillProp, FillResolved } from "@/attributes/shape/fill/union";
import { AssetTracker } from "@/assets/tracker";
import { Anchor } from "@/attributes/layout/anchor";
import { Rect, RectProps } from "../geometry/rect-node";
import { property } from "@/attributes/properties/decorator";
import { anchorProperty, insetsProperty } from "@/attributes/properties/typed";
import { NodeConfig } from "@/nodes/2d/node2d";

export interface ImageProps extends RectProps {
    src?: string;
    /** How the (cropped) image is scaled into the node's bounds. Defaults to `'fill'`. */
    fit?: ImageFit;
    /**
     * Window onto the source, in fractions of its own size, applied before
     * `fit` — `crop={{ horizontal: 0.2 }}` trims a fifth off each side.
     */
    crop?: ImageCrop;
    /** Magnification on top of the fitted scale. `1` (default) is the fitted size. */
    zoom?: number;
    /**
     * The point held fixed as `zoom` scales, and the alignment inside the bounds
     * when the image doesn't cover them. Defaults to `'center'`.
     */
    anchor?: Anchor;
    /** Raw image→shape matrix; bypasses `crop`/`fit`/`zoom`/`anchor` and the bounds. */
    matrix?: ImageMatrix;
    filters?: ImageAdjustment;
}

/**
 * An image. Layout, padding, and child positioning are inherited wholesale from
 * {@link Rect} — an Image lays out its children exactly like a Rect does, just
 * with a decoded image painted in place of the rect's fill. The frame is drawn
 * through an `image` fill stacked beneath any user-supplied `fill` layers
 * (a tint or vignette over the picture), mirroring how {@link Video} paints.
 */
export class Image extends Rect<ImageProps> {

    @property() declare src?: string;
    @property() declare fit?: ImageFit;
    // Declared loose (`ImageCrop`/`Anchor`) so assignment and reads share one
    // type; the accessors store the resolved value. See Rect.
    @insetsProperty() declare crop: ImageCrop;
    @property({ default: 1 }) declare zoom: number;
    @anchorProperty() declare anchor: Anchor;
    @property() declare matrix?: ImageMatrix;
    @property({ default: [], tween: lerpFilterArray, mapper: resolveChainAdjustments })
    declare filters?: MediaAdjustment[];

    constructor(props: NodeConfig<Image, ImageProps>) {
        super(props as NodeConfig<Rect, RectProps>);
    }

    /** The resolved `image` fill painted in place of the rect's fill, or `null`
     *  when no source is set. */
    private imageFill(): ImageFillResolved | null {
        if (!this.src) return null;
        const prop: ImageFillProp = {
            type: 'image',
            src: this.src,
            fit: this.fit,
            crop: this.crop,
            zoom: this.zoom,
            anchor: this.anchor,
            matrix: this.matrix,
            filters: this.filters,
        };
        return resolveFill(prop as FillProp) as ImageFillResolved;
    }

    /**
     * The node's box, as the rect state every pass declares.
     *
     * Split out of {@link shapeGraphics} because the overlay has to declare the
     * same rectangle **twice** inside one mask scope — once as the mask, once as
     * the content — and a `Graphics2D` is a list of ops rather than a shape that
     * can be restated.
     */
    private rectState() {
        return {
            width: this.layoutBounds.width,
            height: this.layoutBounds.height,
            cornerRadius: this.cornerRadius,
            cornerStyle: this.cornerStyle,
            start: this.start,
            end: this.end,
        };
    }

    protected override shapeGraphics(): Graphics2D {
        return new Graphics2D().rect(this.rectState());
    }

    /**
     * The overlay, **clipped to the picture's own alpha** rather than to the
     * node's box.
     *
     * {@link ShapeNode} fills the silhouette, which for a media node is its rect
     * — and on a cut-out PNG that is the wrong shape by a wide margin: a wash
     * meant to tint the subject floods the transparent surround, so the whole
     * box turns colour. Not a subtle error.
     *
     * So the picture is declared as an **alpha mask** and the overlay as the
     * content inside it. `MaskMode.alpha` is the mask machinery's default and is
     * exactly this operation, so the renderer had nothing new to learn.
     *
     * A media node with no source paints no overlay at all: there is nothing
     * drawn to lay anything over, and falling back to the box would reintroduce
     * the bug precisely where it is most visible.
     */
    protected override renderOverlay(ctx: RenderContext2D): void {
        const overlay = this.overlay as FillResolved[];
        if (overlay.length === 0) return;
        const picture = this.imageFill();
        if (!picture) return;

        ctx.draw(
            new Graphics2D()
                .mask()
                .rect(this.rectState())
                .fill([picture as unknown as FillProp])
                .applyMask()
                .rect(this.rectState())
                .fill(overlay as unknown as FillProp[])
                .endMask(),
        );
    }

    protected override renderSelf(draw: RenderContext2D): void {
        // Paint the image fill first (so it sits behind any user-supplied `fill`
        // layers — a tint or vignette over the picture), styled as the rect's fill.
        // Stroke is deferred to renderStroke (drawn after children + overlay), so
        // an overlay texture lands over the photo and under the frame.
        const image = this.imageFill();
        const fills: FillProp[] = image ? [image as FillProp] : [];
        fills.push(...(this.fill as unknown as FillProp[]));

        draw.draw(this.shapeGraphics().shadow(this.shadow).fill(fills));
    }

    /**
     * The picture is a fill this node synthesises rather than one held on
     * `this.fill`, so `ShapeNode`'s declaration cannot see it. Declared through
     * the same `imageFill()` the render uses, which is what stops the two
     * disagreeing about `src`, `crop` or `filters`.
     */
    override prepareRender(tracker: AssetTracker): void {
        super.prepareRender(tracker);
        const image = this.imageFill();
        if (!image) return;
        const rect = this.layoutBounds;
        prepareFill(image, tracker, rect?.width ?? 0, rect?.height ?? 0);
    }
}
