import { RenderContext } from "@/render/render-context";
import { Graphics } from "@/render/graphics";
import { ChainableMx, resolveChainFilters } from "@/attributes/shape/filters/chain";
import { FilterRegistry } from "@/attributes/shape/filters/registry";
import { MediaFilter } from "@/attributes/shape/filters/union";
import { ImageFillMode, ImageTransform } from "@/attributes/shape/fill/implementations/image";
import { BorderRadiusProps, BorderRadiusResolved, resolveBorderRadius, lerpBorderRadius } from "@/attributes/shape/corners/border-radius";
import { ShapeNode, ShapeProps } from "../geometry/shape-node";
import { property } from "@/attributes/properties/decorator";
import { Node, NodeConfig } from "../base/node";
import { AssetTracker } from "@/assets/tracker";
import { BoxBounds } from "@/attributes/layout/bounds";
import { MeasureScope } from "@/render/measure-scope";

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

    override layout(rect: BoxBounds, scope: MeasureScope): void {
        super.layout(rect, scope);

        const constraints = { maxWidth: rect.width, maxHeight: rect.height };
        for (const child of this.children) {
            if (!(child instanceof Node)) continue;
            const size = child.measure(constraints, scope);
            const w = size.width ?? 0;
            const h = size.height ?? 0;
            child.layout({
                x: (rect.width - w) / 2,
                y: (rect.height - h) / 2,
                width: w,
                height: h,
            }, scope);
        }
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
