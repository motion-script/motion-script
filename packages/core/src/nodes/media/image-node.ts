import { RenderContext } from "@/render/render-context";
import { Graphics } from "@/render/graphics";
import { Clip } from "@/render/clip";
import { ImageFilter, resolveChainFilters } from "@/attributes/shape/filters/chain";
import { lerpFilterArray } from "@/attributes/shape/filters/registry";
import { MediaFilter } from "@/attributes/shape/filters/union";
import { ImageFit, ImageFillProp, ImageFillResolved, ImageTransform } from "@/attributes/shape/fill/implementations/image";
import { resolveFill } from "@/attributes/shape/fill/registry";
import { FillProp } from "@/attributes/shape/fill/union";
import { Rect, RectProps } from "../geometry/rect-node";
import { property } from "@/attributes/properties/decorator";
import { NodeConfig } from "../base/node";
import { AssetTracker } from "@/assets/tracker";

export interface ImageProps extends RectProps {
    src?: string;
    fit?: ImageFit;
    transform?: ImageTransform;
    scaling?: number;
    filters?: ImageFilter;
    /**
     * A clip path that cuts through the painted image **and** its children — the
     * frame and everything stacked on it are confined to this outline as one.
     * Unlike `clip` (which only confines children to the node's rect), `clipPath`
     * carves the image itself. Build it with the {@link Clip} builder, composing
     * shapes and `cut()`s for a compound silhouette.
     */
    clipPath?: Clip;
}

/**
 * An image. Layout, padding, and child positioning are inherited wholesale from
 * {@link Rect} — an Image lays out its children exactly like a Rect does, just
 * with a decoded image painted in place of the rect's fill. The frame is drawn
 * through an `image` fill stacked beneath any user-supplied `fill` layers
 * (a tint or vignette over the picture), mirroring how {@link Video} paints.
 */
export class Image extends Rect {

    @property() declare src?: string;
    @property() declare fit?: ImageFit;
    @property() declare transform?: ImageTransform;
    @property() declare scaling?: number;
    @property({ default: [], tween: lerpFilterArray, mapper: resolveChainFilters })
    declare filters?: MediaFilter[];
    @property() declare clipPath?: Clip;

    constructor(props: NodeConfig<Image, ImageProps>) {
        super(props as NodeConfig<Rect, RectProps>);
    }

    override prepareRender(tracker: AssetTracker): void {
        super.prepareRender(tracker);
        if (this.src) tracker.requestImage(this.src, this.layoutRect.width, this.layoutRect.height);
    }

    protected override clipPathSelf(): Clip | null {
        return this.clipPath ?? null;
    }

    /** The resolved `image` fill painted in place of the rect's fill, or `null`
     *  when no source is set. */
    private imageFill(): ImageFillResolved | null {
        if (!this.src) return null;
        const prop: ImageFillProp = {
            type: 'image',
            src: this.src,
            fit: this.fit,
            transform: this.transform,
            scaling: this.scaling,
            filters: this.filters,
        };
        return resolveFill(prop as FillProp) as ImageFillResolved;
    }

    protected override renderSelf(draw: RenderContext): void {
        // Paint the image fill first (so it sits behind any user-supplied `fill`
        // layers — a tint or vignette over the picture), styled as the rect's fill.
        const image = this.imageFill();
        const fills: FillProp[] = image ? [image as FillProp] : [];
        fills.push(...(this.fill as unknown as FillProp[]));

        draw.draw(new Graphics()
            .rect({
                width: this.layoutRect.width,
                height: this.layoutRect.height,
                cornerRadius: this.cornerRadius,
                cornerStyle: this.cornerStyle,
                start: this.start,
                end: this.end,
            })
            .shadow(this.shadow).fill(fills).stroke(this.stroke));
    }
}
