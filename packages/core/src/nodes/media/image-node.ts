import { RenderContext } from "@/render/render-context";
import { Graphics } from "@/render/graphics";
import { ChainableMx, resolveChainFilters } from "@/attributes/shape/filters/chain";
import { FilterRegistry } from "@/attributes/shape/filters/registry";
import { MediaFilter } from "@/attributes/shape/filters/union";
import { ImageFillMode, ImageTransform } from "@/attributes/shape/fill/implementations/image";
import { Rect, RectProps } from "../geometry/rect-node";
import { property } from "@/attributes/properties/decorator";
import { NodeConfig } from "../base/node";
import { AssetTracker } from "@/assets/tracker";

export interface ImageProps extends RectProps {
    src?: string;
    fit?: ImageFillMode;
    transform?: ImageTransform;
    scaling?: number;
    filters?: ChainableMx;
}

/**
 * An image. Layout, padding, and child positioning are inherited wholesale from
 * {@link Rect} — an Image lays out its children exactly like a Rect does, just
 * with a decoded image painted in place of the rect's fill. Only the image
 * source / fit / filters and the `renderSelf` draw call differ.
 */
export class Image extends Rect {

    @property() declare src?: string;
    @property() declare fit?: ImageFillMode;
    @property() declare transform?: ImageTransform;
    @property() declare scaling?: number;
    @property({ default: [], tween: FilterRegistry.lerpArray, mapper: resolveChainFilters })
    declare filters?: MediaFilter[];

    constructor(props: NodeConfig<Image, ImageProps>) {
        super(props as NodeConfig<Rect, RectProps>);
    }

    override prepare(tracker: AssetTracker): void {
        super.prepare(tracker);
        if (this.src) tracker.requestImage(this.src, this.layoutRect.width, this.layoutRect.height);
    }

    protected override renderSelf(draw: RenderContext): void {
        draw.draw(new Graphics()
            .image({
                width: this.layoutRect.width,
                height: this.layoutRect.height,
                borderRadius: this.borderRadius,
                start: this.start,
                end: this.end,
                src: this.src,
                mode: this.fit,
                transform: this.transform,
                scaling: this.scaling,
                filters: this.filters,
            })
            .shadow(this.shadow).fill(this.fill).stroke(this.stroke));
    }
}
