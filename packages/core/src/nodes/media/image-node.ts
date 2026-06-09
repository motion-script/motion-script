import { RenderContext } from "@/render/render-context";
import { Graphics } from "@/render/graphics";
import { ChainableMx, resolveChainFilters } from "@/attributes/shape/filters/chain";
import { FilterRegistry } from "@/attributes/shape/filters/registry";
import { MediaFilter } from "@/attributes/shape/filters/union";
import { ImageFillMode, ImageTransform } from "@/attributes/shape/fill/implementations/image";
import { BorderRadiusProps, BorderRadiusResolved, resolveBorderRadius, lerpBorderRadius } from "@/attributes/shape/corners/border-radius";
import { ShapeNode, ShapeProps } from "../geometry/shape-node";
import { property } from "@/attributes/properties/decorator";
import { NodeConfig } from "../base/node";
import { AssetTracker } from "@/assets/tracker";

export interface ImageProps extends ShapeProps {
    borderRadius?: BorderRadiusProps;
    src?: string;
    fit?: ImageFillMode;
    transform?: ImageTransform;
    scaling?: number;
    filters?: ChainableMx;
}

export class Image extends ShapeNode<ImageProps> {


    @property({ default: 0, mapper: (v: BorderRadiusProps) => resolveBorderRadius(v), tween: lerpBorderRadius })
    declare readonly borderRadius: BorderRadiusResolved;

    @property() declare src?: string;
    @property() declare fit?: ImageFillMode;
    @property() declare transform?: ImageTransform;
    @property() declare scaling?: number;
    @property({ default: [], tween: FilterRegistry.lerpArray, mapper: resolveChainFilters })
    declare filters?: MediaFilter[];

    constructor(props: NodeConfig<Image, ImageProps>) {
        super(props);
    }

    prepare(assetManager: AssetTracker): void {
        if (this.src) assetManager.requestImage(this.src, this.layoutRect.width, this.layoutRect.height);
    }

    protected renderSelf(draw: RenderContext): void {
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
