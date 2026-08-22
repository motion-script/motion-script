/**
 * Ambient declarations for the virtual modules the CLI's Vite plugin injects
 * into this harness app (see src/vite/plugin.ts). None of them exist on disk —
 * they are resolved by alias or generated at load time.
 */

declare module '~user-project' {
    import type { ProjectConfig } from '@motion-script/core';
    const project: ProjectConfig;
    export default project;
}

declare module '~asset-manifest' {
    import type { AssetManifest } from '@motion-script/core';
    const assets: AssetManifest;
    export default assets;
}
