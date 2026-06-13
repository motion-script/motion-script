import { MediaFilter } from "@/attributes/shape/filters/union";
import { RectState, withRectDescriptor } from "./rect";
import { ImageFit, ImageTransform } from "@/attributes/shape/fill/implementations/image";

export interface ImageState extends RectState {
    src?: string;
    mode?: ImageFit;
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
