/** Static metadata for an image asset, captured at build time. */
export interface ImageMeta {
    width: number;
    height: number;
    sizeBytes: number;
    src: string;
}

/** Static metadata for a video asset, captured at build time. */
export interface VideoMeta {
    width: number;
    height: number;
    duration: number; // in seconds
    sizeBytes: number;
    src: string;
}

/** Static metadata for an audio asset, captured at build time. */
export interface AudioMeta {
    duration: number; // in seconds
    sizeBytes: number;
    src: string;
}

/** Static metadata for a font face, captured at build time. */
export interface FontMeta {
    fontFamily: string;
    fontWeight: number;
    src: string;
    sizeBytes: number;
}

/** Discriminated union of all asset metadata shapes. */
export type AssetMeta = ImageMeta | VideoMeta | AudioMeta | FontMeta;

/** Build-time asset manifest keyed by source path (images/videos/audio) or family@weight (fonts). */
export interface AssetManifest {
    image: Record<string, ImageMeta>;
    video: Record<string, VideoMeta>;
    audio: Record<string, AudioMeta>;
    font: Record<string, FontMeta>;
}