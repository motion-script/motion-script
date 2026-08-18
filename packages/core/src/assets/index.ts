/** @internal */ export { AssetCatalog } from "./catalog";
/** @internal */ export type { ImageMeta, VideoMeta, AudioMeta, FontMeta, AssetMeta, AssetManifest } from "./manifest";
/** @internal */ export { AssetTracker } from "./tracker";
/** @internal */ export type { AssetSize, VideoAssetOptions } from "./tracker";
// `AssetRecord` joins these because `StorageAdapter.loadAsset` and
// `cacheSatisfies` both take one, and both are reachable on an exported
// abstract class — a subclass outside this package could not otherwise name the
// parameter type it is obliged to accept.
/** @internal */ export type { LoaderFn, Disposer, AssetRecord } from "./record";
/** @internal */ export { AssetNotLoadedError } from "./errors";
/** @internal */ export { AssetManager } from "./manager";