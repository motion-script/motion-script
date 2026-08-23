
declare module '~user-project' {
    import type { ProjectConfig } from '@motion-script/player';
    const project: ProjectConfig;
    export default project;
}

declare module '~asset-manifest' {
    import type { AssetManifest } from '@motion-script/player';
    const assets: AssetManifest;
    export default assets;
}

declare module '~precomp-cache' {
    /**
     * Previously-measured scene passes, keyed by `__sceneHotId`, that the plugin
     * has already validated against their recorded source hashes. Values are
     * `SerializedScenePrecomp` from core — opaque here, checked on revival.
     */
    const entries: Record<string, unknown>;
    export default entries;
}
