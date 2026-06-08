
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
