import { MediaFilter } from "@/attributes/shape/filters/union";
import { RectState, withRectDescriptor } from "./rect";
import { ImageFillMode, ImageTransform } from "@/attributes/shape/fill/implementations/image";

export interface ImageState extends RectState {
    src?: string;
    mode?: ImageFillMode;
    transform?: ImageTransform;
    scaling?: number;
    filters?: MediaFilter[];
}

export function withImageDescriptor(descriptor: Partial<ImageState>): ImageState {
    return {
        ...withRectDescriptor(descriptor),
        src: descriptor.src,
        mode: descriptor.mode,
        transform: descriptor.transform,
        scaling: descriptor.scaling,
        filters: descriptor.filters,
    };
}
